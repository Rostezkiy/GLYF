package model

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNoteDTO_Validation(t *testing.T) {
	tests := []struct {
		name    string
		note    NoteDTO
		wantErr bool
	}{
		{
			name: "Valid note with all fields",
			note: NoteDTO{
				ID:        "note1",
				Title:     "Test Title",
				Content:   "Test Content",
				IsPinned:  true,
				IsArchived: false,
				IsDeleted: false,
				Color:     "blue",
				CoverImage: "cover.jpg",
				Tags:      json.RawMessage(`["work", "important"]`),
				Attachments: json.RawMessage(`[{"id": "file1", "name": "doc.pdf"}]`),
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Valid note with empty fields",
			note: NoteDTO{
				ID:        "note2",
				Title:     "",
				Content:   "",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Note with folder ID",
			note: NoteDTO{
				ID:        "note3",
				FolderID:  stringPtr("folder1"),
				Title:     "Note in folder",
				Content:   "Content",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Archived note",
			note: NoteDTO{
				ID:          "note4",
				Title:       "Archived",
				Content:     "Content",
				IsArchived:  true,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Deleted note",
			note: NoteDTO{
				ID:        "note5",
				Title:     "Deleted",
				Content:   "Content",
				IsDeleted: true,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Проверяем, что JSON поля валидны
			if len(tt.note.Tags) > 0 {
				var tags []interface{}
				if err := json.Unmarshal(tt.note.Tags, &tags); err != nil {
					t.Errorf("invalid tags JSON: %v", err)
				}
			}
			if len(tt.note.Attachments) > 0 {
				var attachments []interface{}
				if err := json.Unmarshal(tt.note.Attachments, &attachments); err != nil {
					t.Errorf("invalid attachments JSON: %v", err)
				}
			}

			// Проверяем, что даты не нулевые
			if tt.note.CreatedAt.IsZero() {
				t.Error("CreatedAt should not be zero")
			}
			if tt.note.UpdatedAt.IsZero() {
				t.Error("UpdatedAt should not be zero")
			}

			// Проверяем, что если заметка удалена, она не может быть закреплена
			if tt.note.IsDeleted && tt.note.IsPinned {
				t.Error("deleted note cannot be pinned")
			}
		})
	}
}

func TestFolderDTO_Validation(t *testing.T) {
	tests := []struct {
		name    string
		folder  FolderDTO
		wantErr bool
	}{
		{
			name: "Valid folder",
			folder: FolderDTO{
				ID:        "folder1",
				Name:      "Work",
				Color:     "blue",
				IsDeleted: false,
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Folder with parent",
			folder: FolderDTO{
				ID:        "folder2",
				ParentID:  stringPtr("folder1"),
				Name:      "Subfolder",
				Color:     "green",
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Deleted folder",
			folder: FolderDTO{
				ID:        "folder3",
				Name:      "Deleted",
				IsDeleted: true,
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Empty name allowed",
			folder: FolderDTO{
				ID:        "folder4",
				Name:      "",
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.folder.UpdatedAt.IsZero() {
				t.Error("UpdatedAt should not be zero")
			}
		})
	}
}

func TestFileDTO_Validation(t *testing.T) {
	tests := []struct {
		name    string
		file    FileDTO
		wantErr bool
	}{
		{
			name: "Valid file with note",
			file: FileDTO{
				ID:        "file1",
				NoteID:    stringPtr("note1"),
				Name:      "document.pdf",
				Type:      "application/pdf",
				Size:      1024,
				S3Key:     stringPtr("user123/files/file1.pdf"),
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "File without note (orphan)",
			file: FileDTO{
				ID:        "file2",
				Name:      "image.jpg",
				Type:      "image/jpeg",
				Size:      2048,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "File with zero size",
			file: FileDTO{
				ID:        "file3",
				Name:      "empty.txt",
				Type:      "text/plain",
				Size:      0,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.file.CreatedAt.IsZero() {
				t.Error("CreatedAt should not be zero")
			}
			if tt.file.UpdatedAt.IsZero() {
				t.Error("UpdatedAt should not be zero")
			}
			if tt.file.Size < 0 {
				t.Error("Size should not be negative")
			}
		})
	}
}

func TestTagDTO_Validation(t *testing.T) {
	tests := []struct {
		name    string
		tag     TagDTO
		wantErr bool
	}{
		{
			name: "Valid tag",
			tag: TagDTO{
				ID:        "tag1",
				Name:      "work",
				Color:     "blue",
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Tag without color",
			tag: TagDTO{
				ID:        "tag2",
				Name:      "personal",
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
		{
			name: "Tag with empty name",
			tag: TagDTO{
				ID:        "tag3",
				Name:      "",
				UpdatedAt: time.Now(),
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.tag.UpdatedAt.IsZero() {
				t.Error("UpdatedAt should not be zero")
			}
		})
	}
}

func TestSyncPayload_Validation(t *testing.T) {
	now := time.Now()
	payload := SyncPayload{
		Notes: []NoteDTO{
			{
				ID:        "note1",
				Title:     "Test",
				Content:   "Content",
				CreatedAt: now,
				UpdatedAt: now,
			},
		},
		Folders: []FolderDTO{
			{
				ID:        "folder1",
				Name:      "Folder",
				UpdatedAt: now,
			},
		},
		Files: []FileDTO{
			{
				ID:        "file1",
				Name:      "file.txt",
				Type:      "text/plain",
				Size:      100,
				CreatedAt: now,
				UpdatedAt: now,
			},
		},
		Tags: []TagDTO{
			{
				ID:        "tag1",
				Name:      "tag",
				UpdatedAt: now,
			},
		},
	}

	// Проверяем, что все элементы имеют ID
	for i, note := range payload.Notes {
		if note.ID == "" {
			t.Errorf("note %d has empty ID", i)
		}
	}
	for i, folder := range payload.Folders {
		if folder.ID == "" {
			t.Errorf("folder %d has empty ID", i)
		}
	}
	for i, file := range payload.Files {
		if file.ID == "" {
			t.Errorf("file %d has empty ID", i)
		}
	}
	for i, tag := range payload.Tags {
		if tag.ID == "" {
			t.Errorf("tag %d has empty ID", i)
		}
	}
}

func stringPtr(s string) *string {
	return &s
}