package api

import (
	"net/http"
	"noteflow/store"
)

type contextKey string
const UserIDContextKey contextKey = "user_id"

type Handler struct {
	Store     *store.Store
	JWTSecret []byte
	S3Bucket  string
	Broker    *SSEBroker
}

func New(store *store.Store, secret []byte, bucket string) *Handler {
	return &Handler{
		Store:     store,
		JWTSecret: secret,
		S3Bucket:  bucket,
		Broker:    NewSSEBroker(),
	}
}

// Helper to get UserID from context
// ИСПРАВЛЕНИЕ: Используем типизированный ключ UserIDContextKey
func getUserID(r *http.Request) string {
	if val, ok := r.Context().Value(UserIDContextKey).(string); ok {
		return val
	}
	return ""
}