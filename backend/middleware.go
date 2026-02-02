package main

import (
	"context"
	"net"
	"net/http"
	"noteflow/api"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/time/rate"
)

// --- CONTEXT KEYS ---

type contextKey string
const UserIDContextKey contextKey = "user_id"

// --- RATE LIMITER ---

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

var (
	visitors = make(map[string]*visitor)
	mu       sync.Mutex
)

// Separate stricter limits for auth endpoints
type authLimiterKey struct {
	ip    string
	route string // "login", "register", "refresh"
}

var (
	authVisitors = make(map[authLimiterKey]*visitor)
	authMu       sync.Mutex
)

func initRateLimiter() {
	// Clean up general visitors
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			mu.Lock()
			for ip, v := range visitors {
				if time.Since(v.lastSeen) > 10*time.Minute {
					delete(visitors, ip)
				}
			}
			mu.Unlock()
		}
	}()
	// Clean up auth visitors
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			authMu.Lock()
			for key, v := range authVisitors {
				if time.Since(v.lastSeen) > 10*time.Minute {
					delete(authVisitors, key)
				}
			}
			authMu.Unlock()
		}
	}()
}

func getVisitor(ip string) *rate.Limiter {
	mu.Lock()
	defer mu.Unlock()

	v, exists := visitors[ip]
	if !exists {
		limiter := rate.NewLimiter(5, 15) // 5 req/sec burst 15
		visitors[ip] = &visitor{limiter, time.Now()}
		return limiter
	}
	v.lastSeen = time.Now()
	return v.limiter
}

func getAuthVisitor(ip, route string) *rate.Limiter {
	key := authLimiterKey{ip, route}
	authMu.Lock()
	defer authMu.Unlock()

	v, exists := authVisitors[key]
	if !exists {
		// Stricter limits for auth endpoints: 2 req/min burst 5
		limiter := rate.NewLimiter(rate.Every(30*time.Second), 2) // 2 per 30 sec = 4 per min
		authVisitors[key] = &visitor{limiter, time.Now()}
		return limiter
	}
	v.lastSeen = time.Now()
	return v.limiter
}

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}

		limiter := getVisitor(ip)
		if !limiter.Allow() {
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func authRateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}

		path := r.URL.Path
		var route string
		switch path {
		case "/auth/login":
			route = "login"
		case "/auth/register":
			route = "register"
		case "/auth/refresh":
			route = "refresh"
		default:
			route = "other"
		}

		limiter := getAuthVisitor(ip, route)
		if !limiter.Allow() {
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// --- AUTHENTICATION ---

func authMiddleware(jwtSecret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "Unauthorized: No token", http.StatusUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return jwtSecret, nil
			})

			if err != nil || !token.Valid {
				http.Error(w, "Unauthorized: Invalid token", http.StatusUnauthorized)
				return
			}

			// ИСПРАВЛЕНИЕ: Используем стандартный метод GetSubject(),
			// который ожидает поле "sub" в claims.
			userID, err := token.Claims.GetSubject()
			if err != nil || userID == "" {
				http.Error(w, "Unauthorized: Invalid claims", http.StatusUnauthorized)
				return
			}

			// ИСПРАВЛЕНИЕ: Используем типизированный ключ UserIDContextKey
			ctx := context.WithValue(r.Context(), api.UserIDContextKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// --- SECURITY HEADERS ---

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		next.ServeHTTP(w, r)
	})
}

// --- CORS ---

// --- CORS ---

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Получаем заголовок Origin из запроса
		origin := r.Header.Get("Origin")

		// Список разрешенных источников
		allowedOrigins := map[string]bool{
			"http://localhost:5173":      true,
			"http://localhost:3000":      true,
			"http://localhost:8080":      true,
		}

		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-CSRF-Token, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
