// model/types.go
package model

import (
	"encoding/json"
	"time"
)

/* --- DTO STRUCTS --- */

type NoteDTO struct {
	ID              string          `json:"id"`
	FolderID        *string         `json:"folderId"`
	Title           string          `json:"title"`
	Content         string          `json:"content"`
	IsPinned        bool            `json:"isPinned"`
	IsArchived      bool            `json:"isArchived"`
	IsDeleted       bool            `json:"isDeleted"`
	Color           string          `json:"color"`
	CoverImage      string          `json:"coverImage"`
	Tags            json.RawMessage `json:"tags"`
	Attachments     json.RawMessage `json:"attachments"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	ServerUpdatedAt time.Time       `json:"serverUpdatedAt,omitempty"`
}

type FolderDTO struct {
	ID              string    `json:"id"`
	ParentID        *string   `json:"parentId"`
	Name            string    `json:"name"`
	Color           string    `json:"color"`
	IsDeleted       bool      `json:"isDeleted"`
	UpdatedAt       time.Time `json:"updatedAt"`
	ServerUpdatedAt time.Time `json:"serverUpdatedAt,omitempty"`
}

type FileDTO struct {
	ID              string    `json:"id"`
	NoteID          *string   `json:"noteId"`
	Name            string    `json:"name"`
	Type            string    `json:"type"`
	Size            int64     `json:"size"`
	S3Key           *string   `json:"s3Key"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	ServerUpdatedAt time.Time `json:"serverUpdatedAt,omitempty"`
}

type TagDTO struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Color           string    `json:"color"`
	UpdatedAt       time.Time `json:"updatedAt"`
	ServerUpdatedAt time.Time `json:"serverUpdatedAt,omitempty"`
}

type SyncPayload struct {
	Notes   []NoteDTO   `json:"notes"`
	Folders []FolderDTO `json:"folders"`
	Files   []FileDTO   `json:"files"`
	Tags    []TagDTO    `json:"tags"`
}

/* --- AUTH STRUCTS --- */

type AuthRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token        string `json:"token"`
	UserID       string `json:"user_id"`
	StorageLimit int64  `json:"storageLimit"`
	StorageUsed  int64  `json:"storageUsed"`
}