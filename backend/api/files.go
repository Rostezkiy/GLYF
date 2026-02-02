package api

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/go-chi/chi/v5"
	"log"
	"net/http"
	"strings"
	"time"
)

func (h *Handler) HandlePresignedUpload(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	var req struct {
		ID   string `json:"id"`
		Size int64  `json:"size"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	s3Key := fmt.Sprintf("%s/%s", userID, req.ID)
	// We use the minio client directly here for presigning as it's not a persistence op
	url, err := h.Store.Minio.PresignedPutObject(context.Background(), h.S3Bucket, s3Key, time.Minute*15)
	if err != nil {
		http.Error(w, "S3 Error", 500)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"url":   url.String(),
		"s3Key": s3Key,
	})
}

func (h *Handler) HandleCommitUpload(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	var req struct {
		ID    string `json:"id"`
		S3Key string `json:"s3Key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request", 400)
		return
	}
	if !strings.HasPrefix(req.S3Key, userID+"/") {
		http.Error(w, "Forbidden", 403)
		return
	}

	objInfo, err := h.Store.StatObject(context.Background(), h.S3Bucket, req.S3Key)
	if err != nil {
		http.Error(w, "File not found in S3", 404)
		return
	}

	limit, used := h.Store.UserRepository.GetUserStorageStats(userID)
	if used+objInfo.Size > limit {
		h.Store.RemoveObject(context.Background(), h.S3Bucket, req.S3Key)
		http.Error(w, "Quota Exceeded", 413)
		return
	}

	if err := h.Store.DataRepository.CommitFileRecord(r.Context(), userID, req.ID, req.S3Key, objInfo.Size); err != nil {
		log.Println("Commit DB Error:", err)
		http.Error(w, "DB commit error", 500)
		return
	}

	_, newUsed := h.Store.UserRepository.GetUserStorageStats(userID)
	json.NewEncoder(w).Encode(map[string]int64{"storageUsed": newUsed})
}

func (h *Handler) HandlePresignedDownload(w http.ResponseWriter, r *http.Request) {
	s3Key := r.URL.Query().Get("key")
	userID := getUserID(r)
	if !strings.HasPrefix(s3Key, userID+"/") {
		http.Error(w, "Forbidden", 403)
		return
	}
	url, _ := h.Store.Minio.PresignedGetObject(context.Background(), h.S3Bucket, s3Key, time.Minute*15, nil)
	json.NewEncoder(w).Encode(map[string]string{"url": url.String()})
}

func (h *Handler) HandlePermanentDelete(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	noteID := chi.URLParam(r, "id")

	if noteID == "" {
		http.Error(w, "Missing ID", 400)
		return
	}

	keysToDelete, err := h.Store.DataRepository.GetNoteFileKeys(r.Context(), userID, noteID)
	if err != nil {
		http.Error(w, "DB Error", 500)
		return
	}

	ctx := context.Background()
	for _, key := range keysToDelete {
		err := h.Store.RemoveObject(ctx, h.S3Bucket, key)
		if err != nil {
			log.Printf("Failed to delete from S3: %s, err: %v", key, err)
		}
	}

	if err := h.Store.DataRepository.DeleteNote(r.Context(), userID, noteID); err != nil {
		http.Error(w, "Final delete failed", 500)
		return
	}

	w.WriteHeader(200)
}