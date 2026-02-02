package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	"noteflow/model"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestSaveSyncData_CreateNote(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	// Mock transaction
	mock.ExpectBegin()
	
	// Mock prepared statement for notes
	mock.ExpectPrepare(`INSERT INTO notes`)
	
	tagsJSON, _ := json.Marshal([]string{"work", "important"})
	attachmentsJSON, _ := json.Marshal([]map[string]interface{}{{"id": "file1", "name": "doc.pdf"}})
	
	mock.ExpectExec(`INSERT INTO notes`).
		WithArgs("note1", "user123", nil, "Test Title", "Test Content", int64(13), false, false, false, "", "", tagsJSON, attachmentsJSON, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	mock.ExpectCommit()

	payload := model.SyncPayload{
		Notes: []model.NoteDTO{
			{
				ID:        "note1",
				Title:     "Test Title",
				Content:   "Test Content",
				Tags:      tagsJSON,
				Attachments: attachmentsJSON,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
		},
	}

	err = repo.SaveSyncData(context.Background(), "user123", payload)
	if err != nil {
		t.Errorf("SaveSyncData failed: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestSaveSyncData_UpdateNote(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	mock.ExpectBegin()
	mock.ExpectPrepare(`INSERT INTO notes`)
	
	mock.ExpectExec(`INSERT INTO notes`).
		WithArgs("note1", "user123", nil, "Updated Title", "Updated Content", int64(15), true, false, false, "blue", "cover.jpg", []byte("[]"), []byte("[]"), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	mock.ExpectCommit()

	payload := model.SyncPayload{
		Notes: []model.NoteDTO{
			{
				ID:        "note1",
				Title:     "Updated Title",
				Content:   "Updated Content",
				IsPinned:  true,
				Color:     "blue",
				CoverImage: "cover.jpg",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
		},
	}

	err = repo.SaveSyncData(context.Background(), "user123", payload)
	if err != nil {
		t.Errorf("SaveSyncData failed: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestSaveSyncData_ArchiveNote(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	mock.ExpectBegin()
	mock.ExpectPrepare(`INSERT INTO notes`)
	
	mock.ExpectExec(`INSERT INTO notes`).
		WithArgs("note1", "user123", nil, "Archived Note", "Content", int64(7), false, true, false, "", "", []byte("[]"), []byte("[]"), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	mock.ExpectCommit()

	payload := model.SyncPayload{
		Notes: []model.NoteDTO{
			{
				ID:          "note1",
				Title:       "Archived Note",
				Content:     "Content",
				IsArchived:  true,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
		},
	}

	err = repo.SaveSyncData(context.Background(), "user123", payload)
	if err != nil {
		t.Errorf("SaveSyncData failed: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestSaveSyncData_DeleteNote(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	mock.ExpectBegin()
	mock.ExpectPrepare(`INSERT INTO notes`)
	
	mock.ExpectExec(`INSERT INTO notes`).
		WithArgs("note1", "user123", nil, "Deleted Note", "Content", int64(7), false, false, true, "", "", []byte("[]"), []byte("[]"), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	mock.ExpectCommit()

	payload := model.SyncPayload{
		Notes: []model.NoteDTO{
			{
				ID:        "note1",
				Title:     "Deleted Note",
				Content:   "Content",
				IsDeleted: true,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
		},
	}

	err = repo.SaveSyncData(context.Background(), "user123", payload)
	if err != nil {
		t.Errorf("SaveSyncData failed: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestSaveSyncData_WithFolder(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	mock.ExpectBegin()
	
	// Mock notes with folder
	mock.ExpectPrepare(`INSERT INTO notes`)
	folderID := "folder1"
	mock.ExpectExec(`INSERT INTO notes`).
		WithArgs("note1", "user123", &folderID, "Note in Folder", "Content", int64(7), false, false, false, "", "", []byte("[]"), []byte("[]"), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	// Mock folder insert
	mock.ExpectPrepare(`INSERT INTO folders`)
	mock.ExpectExec(`INSERT INTO folders`).
		WithArgs("folder1", "user123", nil, "Work", "blue", false, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	mock.ExpectCommit()

	payload := model.SyncPayload{
		Notes: []model.NoteDTO{
			{
				ID:        "note1",
				FolderID:  &folderID,
				Title:     "Note in Folder",
				Content:   "Content",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
		},
		Folders: []model.FolderDTO{
			{
				ID:        "folder1",
				Name:      "Work",
				Color:     "blue",
				UpdatedAt: time.Now(),
			},
		},
	}

	err = repo.SaveSyncData(context.Background(), "user123", payload)
	if err != nil {
		t.Errorf("SaveSyncData failed: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetSyncData_Empty(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	// Mock empty results for all tables
	mock.ExpectQuery(`SELECT id, folder_id, title, content, is_pinned, is_archived, is_deleted, color, cover_image, tags, attachments, created_at, updated_at, server_updated_at FROM notes WHERE user_id=\$1 AND server_updated_at > \$2`).
		WithArgs("user123", "2024-01-01T00:00:00Z").
		WillReturnRows(sqlmock.NewRows([]string{"id", "folder_id", "title", "content", "is_pinned", "is_archived", "is_deleted", "color", "cover_image", "tags", "attachments", "created_at", "updated_at", "server_updated_at"}))

	mock.ExpectQuery(`SELECT id, parent_id, name, color, is_deleted, updated_at, server_updated_at FROM folders WHERE user_id=\$1 AND server_updated_at > \$2`).
		WithArgs("user123", "2024-01-01T00:00:00Z").
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id", "name", "color", "is_deleted", "updated_at", "server_updated_at"}))

	mock.ExpectQuery(`SELECT id, note_id, name, type, size, s3_key, created_at, updated_at, server_updated_at FROM files WHERE user_id=\$1 AND server_updated_at > \$2`).
		WithArgs("user123", "2024-01-01T00:00:00Z").
		WillReturnRows(sqlmock.NewRows([]string{"id", "note_id", "name", "type", "size", "s3_key", "created_at", "updated_at", "server_updated_at"}))

	mock.ExpectQuery(`SELECT id, name, color, updated_at, server_updated_at FROM tags WHERE user_id=\$1 AND server_updated_at > \$2`).
		WithArgs("user123", "2024-01-01T00:00:00Z").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "color", "updated_at", "server_updated_at"}))

	payload, err := repo.GetSyncData(context.Background(), "user123", "2024-01-01T00:00:00Z", 0)
	if err != nil {
		t.Errorf("GetSyncData failed: %v", err)
	}

	if len(payload.Notes) != 0 || len(payload.Folders) != 0 || len(payload.Files) != 0 || len(payload.Tags) != 0 {
		t.Errorf("expected empty payload, got notes=%d, folders=%d, files=%d, tags=%d",
			len(payload.Notes), len(payload.Folders), len(payload.Files), len(payload.Tags))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetSyncData_WithNotes(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	now := time.Now()
	
	// Mock notes with data
	notesRows := sqlmock.NewRows([]string{"id", "folder_id", "title", "content", "is_pinned", "is_archived", "is_deleted", "color", "cover_image", "tags", "attachments", "created_at", "updated_at", "server_updated_at"}).
		AddRow("note1", nil, "Title 1", "Content 1", true, false, false, "blue", "cover.jpg", []byte(`["tag1"]`), []byte(`[]`), now, now, now).
		AddRow("note2", sql.NullString{String: "folder1", Valid: true}, "Title 2", "Content 2", false, true, false, "", "", []byte(`[]`), []byte(`[]`), now, now, now)

	mock.ExpectQuery(`SELECT id, folder_id, title, content, is_pinned, is_archived, is_deleted, color, cover_image, tags, attachments, created_at, updated_at, server_updated_at FROM notes WHERE user_id=\$1 AND server_updated_at > \$2`).
		WithArgs("user123", "1970-01-01T00:00:00Z").
		WillReturnRows(notesRows)

	// Mock empty other tables
	mock.ExpectQuery(`SELECT id, parent_id, name, color, is_deleted, updated_at, server_updated_at FROM folders WHERE user_id=\$1 AND server_updated_at > \$2`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id", "name", "color", "is_deleted", "updated_at", "server_updated_at"}))

	mock.ExpectQuery(`SELECT id, note_id, name, type, size, s3_key, created_at, updated_at, server_updated_at FROM files WHERE user_id=\$1 AND server_updated_at > \$2`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "note_id", "name", "type", "size", "s3_key", "created_at", "updated_at", "server_updated_at"}))

	mock.ExpectQuery(`SELECT id, name, color, updated_at, server_updated_at FROM tags WHERE user_id=\$1 AND server_updated_at > \$2`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "color", "updated_at", "server_updated_at"}))

	payload, err := repo.GetSyncData(context.Background(), "user123", "1970-01-01T00:00:00Z", 0)
	if err != nil {
		t.Errorf("GetSyncData failed: %v", err)
	}

	if len(payload.Notes) != 2 {
		t.Errorf("expected 2 notes, got %d", len(payload.Notes))
	}

	// Check first note
	if payload.Notes[0].Title != "Title 1" {
		t.Errorf("expected title 'Title 1', got %s", payload.Notes[0].Title)
	}
	if !payload.Notes[0].IsPinned {
		t.Errorf("expected note 1 to be pinned")
	}
	if payload.Notes[0].Color != "blue" {
		t.Errorf("expected color 'blue', got %s", payload.Notes[0].Color)
	}

	// Check second note
	if payload.Notes[1].FolderID == nil || *payload.Notes[1].FolderID != "folder1" {
		t.Errorf("expected folder ID 'folder1', got %v", payload.Notes[1].FolderID)
	}
	if !payload.Notes[1].IsArchived {
		t.Errorf("expected note 2 to be archived")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetSyncData_WithLimit(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	now := time.Now()
	
	// Mock notes with limit
	notesRows := sqlmock.NewRows([]string{"id", "folder_id", "title", "content", "is_pinned", "is_archived", "is_deleted", "color", "cover_image", "tags", "attachments", "created_at", "updated_at", "server_updated_at"}).
		AddRow("note1", nil, "Title 1", "Content 1", false, false, false, "", "", []byte(`[]`), []byte(`[]`), now, now, now)

	mock.ExpectQuery(`SELECT id, folder_id, title, content, is_pinned, is_archived, is_deleted, color, cover_image, tags, attachments, created_at, updated_at, server_updated_at FROM notes WHERE user_id=\$1 AND server_updated_at > \$2 LIMIT \$3`).
		WithArgs("user123", "1970-01-01T00:00:00Z", 10).
		WillReturnRows(notesRows)

	// Mock other tables with limit
	mock.ExpectQuery(`SELECT id, parent_id, name, color, is_deleted, updated_at, server_updated_at FROM folders WHERE user_id=\$1 AND server_updated_at > \$2 LIMIT \$3`).
		WithArgs("user123", "1970-01-01T00:00:00Z", 10).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id", "name", "color", "is_deleted", "updated_at", "server_updated_at"}))

	mock.ExpectQuery(`SELECT id, note_id, name, type, size, s3_key, created_at, updated_at, server_updated_at FROM files WHERE user_id=\$1 AND server_updated_at > \$2 LIMIT \$3`).
		WithArgs("user123", "1970-01-01T00:00:00Z", 10).
		WillReturnRows(sqlmock.NewRows([]string{"id", "note_id", "name", "type", "size", "s3_key", "created_at", "updated_at", "server_updated_at"}))

	mock.ExpectQuery(`SELECT id, name, color, updated_at, server_updated_at FROM tags WHERE user_id=\$1 AND server_updated_at > \$2 LIMIT \$3`).
		WithArgs("user123", "1970-01-01T00:00:00Z", 10).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "color", "updated_at", "server_updated_at"}))

	payload, err := repo.GetSyncData(context.Background(), "user123", "1970-01-01T00:00:00Z", 10)
	if err != nil {
		t.Errorf("GetSyncData failed: %v", err)
	}

	if len(payload.Notes) != 1 {
		t.Errorf("expected 1 note, got %d", len(payload.Notes))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestDeleteNote(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	mock.ExpectExec(`DELETE FROM notes WHERE id = \$1 AND user_id = \$2`).
		WithArgs("note1", "user123").
		WillReturnResult(sqlmock.NewResult(0, 1))

	err = repo.DeleteNote(context.Background(), "user123", "note1")
	if err != nil {
		t.Errorf("DeleteNote failed: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetNoteFileKeys(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewDataRepository(db)

	rows := sqlmock.NewRows([]string{"s3_key"}).
		AddRow("user123/files/file1.jpg").
		AddRow("user123/files/file2.pdf").
		AddRow(sql.NullString{})

	mock.ExpectQuery(`SELECT s3_key FROM files WHERE note_id = \$1 AND user_id = \$2`).
		WithArgs("note1", "user123").
		WillReturnRows(rows)

	keys, err := repo.GetNoteFileKeys(context.Background(), "user123", "note1")
	if err != nil {
		t.Errorf("GetNoteFileKeys failed: %v", err)
	}

	if len(keys) != 2 {
		t.Errorf("expected 2 keys, got %d", len(keys))
	}

	expectedKeys := []string{"user123/files/file1.jpg", "user123/files/file2.pdf"}
	for i, key := range keys {
		if key != expectedKeys[i] {
			t.Errorf("expected key %s at index %d, got %s", expectedKeys[i], i, key)
		}
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}