// main.go
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"noteflow/api"
	"noteflow/store"
)

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func main() {
	// 1. Config
	dbUrl := getEnv("DB_URL", "postgres://user:password@localhost:5432/noteflow?sslmode=disable")
	// ВАЖНО: JWT_SECRET должен быть таким же, каким подписываются токены при логине
	jwtSecret := []byte(getEnv("JWT_SECRET", "CHANGE_ME_IN_PROD_PLEASE"))

	s3Endpoint := getEnv("S3_ENDPOINT", "localhost:9000")
	s3Access := getEnv("S3_ACCESS_KEY", "minioadmin")
	s3Secret := getEnv("S3_SECRET_KEY", "minioadmin")
	s3Bucket := getEnv("S3_BUCKET", "noteflow-files")
	s3Secure := getEnv("S3_SECURE", "false") == "true"

	// 2. Services Init
	initRateLimiter()

	// MinIO Client
	minioClient, err := minio.New(s3Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(s3Access, s3Secret, ""),
		Secure: s3Secure,
	})
	if err != nil {
		log.Fatal("Minio Init error:", err)
	}

	// Store (DB + MinIO wrapper)
	st, err := store.New(dbUrl, minioClient)
	if err != nil {
		log.Fatal("DB Connect error:", err)
	}
	defer st.Close() // Close DB connection on exit

	// Ensure Bucket exists
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := st.EnsureBucket(ctx, s3Bucket); err != nil {
		log.Printf("Warning: Bucket check failed: %v", err)
	}

	// Handlers
	h := api.New(st, jwtSecret, s3Bucket)

	// 3. Router Setup
	r := chi.NewRouter()

	// Global Middlewares
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)
	r.Use(securityHeadersMiddleware)
	r.Use(corsMiddleware)
	r.Use(rateLimitMiddleware)

	// Public Routes with stricter rate limiting
	r.With(authRateLimitMiddleware).Post("/auth/register", h.HandleRegister)
	r.With(authRateLimitMiddleware).Post("/auth/login", h.HandleLogin)
	r.With(authRateLimitMiddleware).Post("/auth/refresh", h.HandleRefresh)

	// SSE Route
	// Важно: он находится вне authMiddleware, так как проверяет токен из URL query param
	r.Get("/sync/events", h.HandleSSE)

	// Protected Routes (требуют заголовок Authorization: Bearer ...)
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware(jwtSecret)) // JWT Check Middleware

		r.Post("/sync/push", h.HandlePush)
		r.Get("/sync/pull", h.HandlePull)

		r.Post("/files/presigned-upload", h.HandlePresignedUpload)
		r.Post("/files/commit-upload", h.HandleCommitUpload)
		r.Get("/files/view-url", h.HandlePresignedDownload)

		r.Delete("/notes/{id}", h.HandlePermanentDelete)
	})

	// 4. Subscription Routes
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware(jwtSecret))

		r.Get("/user/profile", h.HandleGetUserProfile)
		r.Get("/subscription/plans", h.HandleGetSubscriptionPlans)
		r.Post("/subscription/create", h.HandleCreatePayment)
		r.Post("/subscription/upgrade", h.HandleUpgradeTier)
	})

	// Webhook route (public, но с проверкой подписи)
	r.Post("/webhook/yookassa", h.HandleWebhook)

	// 5. Start background cleanup goroutine
	go startSubscriptionCleanup(st, s3Bucket)

	port := getEnv("PORT", "8080")
	log.Printf("Server running on :%s", port)
	http.ListenAndServe(":"+port, r)
}

// startSubscriptionCleanup запускает фоновую горутину для очистки подписок
func startSubscriptionCleanup(st *store.Store, bucket string) {
	ticker := time.NewTicker(24 * time.Hour) // Проверка раз в 24 часа
	defer ticker.Stop()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)

		// 1. Проверяем истекшие подписки и переводим на free
		expiredUsers, err := st.UserRepository.GetUsersWithExpiredSubscriptions()
		if err != nil {
			log.Printf("Failed to get expired subscriptions: %v", err)
		} else {
			for _, userID := range expiredUsers {
				// Переводим на free тариф
				if err := st.UserRepository.UpdateUserTier(userID, "free", time.Now()); err != nil {
					log.Printf("Failed to downgrade user %s to free: %v", userID, err)
				} else {
					log.Printf("User %s downgraded to free tier (subscription expired)", userID)
				}
			}
		}

		// 2. Проверяем пользователей на free более 90 дней и удаляем их файлы
		cleanupUsers, err := st.UserRepository.GetUsersForCleanup(90)
		if err != nil {
			log.Printf("Failed to get users for cleanup: %v", err)
		} else {
			for _, userID := range cleanupUsers {
				// Удаляем файлы из S3
				if err := st.UserRepository.DeleteUserFiles(ctx, bucket, userID); err != nil {
					log.Printf("Failed to delete files for user %s: %v", userID, err)
				} else {
					log.Printf("User %s files deleted (free for >90 days)", userID)
				}
			}
		}

		cancel()
	}
}
