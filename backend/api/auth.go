package api

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/mail"
	"noteflow/model"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var validate = validator.New()

// generateTokenPair создает Access (JWT) и Refresh (Random String) токены
func (h *Handler) generateTokenPair(userID, ip, userAgent string) (string, string, error) {
	// 1. Access Token (Живет 15 минут)
	// ИСПРАВЛЕНИЕ: Используем стандартный claim "sub" для ID пользователя
	accessClaims := jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(15 * time.Minute).Unix(),
		"iat": time.Now().Unix(),
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString(h.JWTSecret)
	if err != nil {
		return "", "", err
	}

	// 2. Refresh Token (Живет 30 дней)
	randomBytes := make([]byte, 32)
	_, err = rand.Read(randomBytes)
	if err != nil {
		return "", "", err
	}
	refreshToken := base64.URLEncoding.EncodeToString(randomBytes)

	// 3. Сохраняем хеш рефреш токена в БД
	hash := sha256.Sum256([]byte(refreshToken))
	hashString := hex.EncodeToString(hash[:])

	_, err = h.Store.DB.Exec(`
		INSERT INTO refresh_tokens (token_hash, user_id, expires_at, client_ip, user_agent)
		VALUES ($1, $2, NOW() + INTERVAL '30 days', $3, $4)
	`, hashString, userID, ip, userAgent)

	return accessToken, refreshToken, err
}

func (h *Handler) HandleRegister(w http.ResponseWriter, r *http.Request) {
	// Limit request size to prevent DoS
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024) // 10 KB
	var req model.AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Trim spaces
	req.Email = strings.TrimSpace(req.Email)
	req.Password = strings.TrimSpace(req.Password)

	// Validate email format
	if _, err := mail.ParseAddress(req.Email); err != nil {
		http.Error(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	// Stronger password validation
	if len(req.Password) < 8 {
		http.Error(w, "Password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	if len(req.Password) > 128 {
		http.Error(w, "Password too long", http.StatusBadRequest)
		return
	}
	if strings.ContainsAny(req.Password, "\x00") {
		http.Error(w, "Password contains invalid characters", http.StatusBadRequest)
		return
	}

	// Validate email length
	if len(req.Email) > 254 {
		http.Error(w, "Email too long", http.StatusBadRequest)
		return
	}
	// Additional validator for email pattern
	if err := validate.Var(req.Email, "email"); err != nil {
		http.Error(w, "Invalid email", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	id, err := h.Store.UserRepository.CreateUser(req.Email, string(hash))
	if err != nil {
		http.Error(w, "User already exists", http.StatusConflict)
		return
	}

	accessToken, refreshToken, err := h.generateTokenPair(id, r.RemoteAddr, r.UserAgent())
	if err != nil {
		http.Error(w, "Token generation failed", http.StatusInternalServerError)
		return
	}

	// Get user profile with subscription info
	profile, err := h.Store.UserRepository.GetUserProfile(id)
	if err != nil {
		http.Error(w, "Failed to load user profile", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token":                 accessToken,
		"refreshToken":          refreshToken,
		"user_id":               id,
		"storageLimit":          profile.StorageLimit,
		"storageUsed":           profile.StorageUsed,
		"tier":                  profile.Tier,
		"maxFileSize":           profile.MaxFileSize,
		"subscriptionExpiresAt": profile.SubscriptionExpiresAt,
		"freeSince":             profile.FreeSince,
		"cleanupWarningDate":    profile.CleanupWarningDate,
		"hasSyncAccess":         profile.HasSyncAccess,
	})
}

func (h *Handler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024) // 10 KB
	var req model.AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Sanitize input
	req.Email = strings.TrimSpace(req.Email)
	req.Password = strings.TrimSpace(req.Password)

	// Basic validation
	if _, err := mail.ParseAddress(req.Email); err != nil {
		http.Error(w, "Invalid email format", http.StatusUnauthorized)
		return
	}
	if len(req.Password) == 0 || len(req.Password) > 128 {
		http.Error(w, "Invalid password length", http.StatusUnauthorized)
		return
	}

	id, hash, err := h.Store.UserRepository.GetUserByEmail(req.Email)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	accessToken, refreshToken, err := h.generateTokenPair(id, r.RemoteAddr, r.UserAgent())
	if err != nil {
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Get user profile with subscription info
	profile, err := h.Store.UserRepository.GetUserProfile(id)
	if err != nil {
		http.Error(w, "Failed to load user profile", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token":                 accessToken,
		"refreshToken":          refreshToken,
		"user_id":               id,
		"storageLimit":          profile.StorageLimit,
		"storageUsed":           profile.StorageUsed,
		"tier":                  profile.Tier,
		"maxFileSize":           profile.MaxFileSize,
		"subscriptionExpiresAt": profile.SubscriptionExpiresAt,
		"freeSince":             profile.FreeSince,
		"cleanupWarningDate":    profile.CleanupWarningDate,
		"hasSyncAccess":         profile.HasSyncAccess,
	})
}

func (h *Handler) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 5*1024) // 5 KB
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	if len(req.RefreshToken) == 0 || len(req.RefreshToken) > 512 {
		http.Error(w, "Invalid refresh token", http.StatusBadRequest)
		return
	}

	hash := sha256.Sum256([]byte(req.RefreshToken))
	hashString := hex.EncodeToString(hash[:])

	var userID string
	err := h.Store.DB.QueryRow(`
		SELECT user_id FROM refresh_tokens 
		WHERE token_hash=$1 AND expires_at > NOW()
	`, hashString).Scan(&userID)

	if err == sql.ErrNoRows {
		http.Error(w, "Invalid or expired refresh token", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	h.Store.DB.Exec("DELETE FROM refresh_tokens WHERE token_hash=$1", hashString)

	newAccess, newRefresh, err := h.generateTokenPair(userID, r.RemoteAddr, r.UserAgent())
	if err != nil {
		http.Error(w, "Generation failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token":        newAccess,
		"refreshToken": newRefresh,
	})
}
