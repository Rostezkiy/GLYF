package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"noteflow/model"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// HandleSSE управляет Server-Sent Events соединением
func (h *Handler) HandleSSE(w http.ResponseWriter, r *http.Request) {
	// 1. Получаем токен из URL параметров
	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		http.Error(w, "Missing token", http.StatusUnauthorized)
		return
	}

	// 2. Валидируем токен вручную
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return h.JWTSecret, nil
	})

	if err != nil || !token.Valid {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// ИСПРАВЛЕНИЕ: Теперь мы используем GetSubject(), и это будет работать,
	// так как при генерации мы установили поле "sub".
	userID, err := token.Claims.GetSubject()
	if err != nil || userID == "" {
		http.Error(w, "Invalid token claims", http.StatusUnauthorized)
		return
	}

	// 3. Устанавливаем заголовки для SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// 4. Подписываемся на обновления
	msgChan := h.Broker.Subscribe(userID)
	defer h.Broker.Unsubscribe(userID, msgChan)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	// 5. Главный цикл ожидания событий
	for {
		select {
		case <-r.Context().Done():
			return

		case <-msgChan:
			fmt.Fprintf(w, "data: sync_needed\n\n")
			flusher.Flush()

		case <-ticker.C:
			fmt.Fprintf(w, ": keep-alive\n\n")
			flusher.Flush()
		}
	}
}

// HandlePush принимает зашифрованные изменения от клиента
func (h *Handler) HandlePush(w http.ResponseWriter, r *http.Request) {
	// ИСПРАВЛЕНИЕ: Используем хелпер getUserID (который использует безопасный ключ)
	userID := getUserID(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Проверяем доступ к синхронизации по тарифу
	tier, _, _, err := h.Store.UserRepository.GetUserTier(userID)
	if err != nil {
		http.Error(w, "Failed to get user tier", http.StatusInternalServerError)
		return
	}
	if !model.UserTier(tier).HasSyncAccess() {
		http.Error(w, "Sync not available for free tier", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 15*1024*1024)

	var payload model.SyncPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.Store.DataRepository.SaveSyncData(r.Context(), userID, payload); err != nil {
		http.Error(w, "DB/Sync Error", http.StatusInternalServerError)
		return
	}

	go h.Broker.Notify(userID)

	w.WriteHeader(http.StatusOK)
}

// HandlePull отдает клиенту данные, измененные с момента since
func (h *Handler) HandlePull(w http.ResponseWriter, r *http.Request) {
	// ИСПРАВЛЕНИЕ: Используем хелпер getUserID
	userID := getUserID(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	since := r.URL.Query().Get("since")
	if since == "" {
		since = "1970-01-01T00:00:00Z"
	}

	// Пагинация: limit (по умолчанию 0 - без ограничений, максимум 1000)
	limitStr := r.URL.Query().Get("limit")
	limit := 0
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			limit = n
			if limit > 1000 {
				limit = 1000
			}
		}
	}

	payload, err := h.Store.DataRepository.GetSyncData(r.Context(), userID, since, limit)
	if err != nil {
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}
