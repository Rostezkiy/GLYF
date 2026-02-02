package store

import (
	"context"
	"database/sql"
	"log"
	"time"

	"noteflow/model"
)

// DataRepository объединяет все операции с данными (Sync + File)
type DataRepository struct {
	db *sql.DB
}

func NewDataRepository(db *sql.DB) *DataRepository {
	return &DataRepository{db: db}
}

// ==================== SYNC OPERATIONS ====================

// SaveSyncData выполняет массовое сохранение изменений (Push) с использованием подготовленных statements
func (r *DataRepository) SaveSyncData(ctx context.Context, userID string, payload model.SyncPayload) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. NOTES
	if len(payload.Notes) > 0 {
		stmt, err := tx.PrepareContext(ctx, `
			INSERT INTO notes (id, user_id, folder_id, title, content, size, is_pinned, is_archived, is_deleted, color, cover_image, tags, attachments, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
			ON CONFLICT (id) DO UPDATE SET
				folder_id=EXCLUDED.folder_id, title=EXCLUDED.title, content=EXCLUDED.content, size=EXCLUDED.size,
				is_pinned=EXCLUDED.is_pinned, is_archived=EXCLUDED.is_archived, is_deleted=EXCLUDED.is_deleted,
				color=EXCLUDED.color, cover_image=EXCLUDED.cover_image,
				tags=EXCLUDED.tags, attachments=EXCLUDED.attachments,
				updated_at=EXCLUDED.updated_at
			WHERE notes.user_id = $2
		`)
		if err != nil {
			return err
		}
		defer stmt.Close()

		for _, n := range payload.Notes {
			if n.ID == "" {
				continue
			}
			tagsJSON := n.Tags
			if len(tagsJSON) == 0 {
				tagsJSON = []byte("[]")
			}
			attJSON := n.Attachments
			if len(attJSON) == 0 {
				attJSON = []byte("[]")
			}
			noteSize := int64(len(n.Content))

			_, err := stmt.ExecContext(ctx,
				n.ID, userID, n.FolderID, n.Title, n.Content, noteSize,
				n.IsPinned, n.IsArchived, n.IsDeleted, n.Color, n.CoverImage,
				tagsJSON, attJSON, n.CreatedAt, n.UpdatedAt)
			if err != nil {
				log.Printf("Push Note Error (ID: %s): %v", n.ID, err)
				return err
			}
		}
	}

	// 2. FOLDERS
	if len(payload.Folders) > 0 {
		stmt, err := tx.PrepareContext(ctx, `
			INSERT INTO folders (id, user_id, parent_id, name, color, is_deleted, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (id) DO UPDATE SET
				parent_id=EXCLUDED.parent_id, name=EXCLUDED.name, color=EXCLUDED.color, is_deleted=EXCLUDED.is_deleted,
				updated_at=EXCLUDED.updated_at
			WHERE folders.user_id = $2
		`)
		if err != nil {
			return err
		}
		defer stmt.Close()

		for _, f := range payload.Folders {
			if f.ID == "" {
				continue
			}
			_, err := stmt.ExecContext(ctx, f.ID, userID, f.ParentID, f.Name, f.Color, f.IsDeleted, f.UpdatedAt)
			if err != nil {
				log.Printf("Push Folder Error: %v", err)
				return err
			}
		}
	}

	// 3. FILES
	if len(payload.Files) > 0 {
		stmt, err := tx.PrepareContext(ctx, `
			INSERT INTO files (id, user_id, note_id, name, type, size, s3_key, is_uploaded, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (id) DO UPDATE SET
				note_id = EXCLUDED.note_id,
				name = CASE WHEN EXCLUDED.name != '' THEN EXCLUDED.name ELSE files.name END,
				type = CASE WHEN EXCLUDED.type != '' THEN EXCLUDED.type ELSE files.type END,
				size = CASE WHEN EXCLUDED.size != 0 THEN EXCLUDED.size ELSE files.size END,
				s3_key = COALESCE(EXCLUDED.s3_key, files.s3_key),
				is_uploaded = files.is_uploaded OR EXCLUDED.is_uploaded,
				created_at = CASE
					WHEN EXCLUDED.created_at = '0001-01-01 00:00:00+00'::timestamptz
					THEN files.created_at
					ELSE EXCLUDED.created_at
				END,
				updated_at = EXCLUDED.updated_at
			WHERE files.user_id = $2
		`)
		if err != nil {
			return err
		}
		defer stmt.Close()

		for _, f := range payload.Files {
			if f.ID == "" {
				continue
			}
			created := f.CreatedAt
			if created.IsZero() {
				created = time.Now()
			}
			updated := f.UpdatedAt
			if updated.IsZero() {
				updated = created
			}
			isUploadedByClient := f.S3Key != nil && *f.S3Key != ""

			_, err := stmt.ExecContext(ctx, f.ID, userID, f.NoteID, f.Name, f.Type, f.Size, f.S3Key, isUploadedByClient, created, updated)
			if err != nil {
				log.Printf("Push File Error (ID: %s): %v", f.ID, err)
				return err
			}
		}
	}

	// 4. TAGS
	if len(payload.Tags) > 0 {
		stmt, err := tx.PrepareContext(ctx, `
			INSERT INTO tags (id, user_id, name, color, updated_at)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (id) DO UPDATE SET
				name=EXCLUDED.name, color=EXCLUDED.color, updated_at=EXCLUDED.updated_at
			WHERE tags.user_id = $2
		`)
		if err != nil {
			return err
		}
		defer stmt.Close()

		for _, t := range payload.Tags {
			if t.ID == "" {
				continue
			}
			_, err := stmt.ExecContext(ctx, t.ID, userID, t.Name, t.Color, t.UpdatedAt)
			if err != nil {
				log.Printf("Push Tag Error: %v", err)
				return err
			}
		}
	}

	return tx.Commit()
}

// GetSyncData возвращает изменения с момента last_sync (Pull)
// limit <= 0 означает отсутствие ограничения
func (r *DataRepository) GetSyncData(ctx context.Context, userID string, since string, limit int) (*model.SyncPayload, error) {
	resp := &model.SyncPayload{
		Notes:   []model.NoteDTO{},
		Folders: []model.FolderDTO{},
		Files:   []model.FileDTO{},
		Tags:    []model.TagDTO{},
	}

	// 1. NOTES
	notesQuery := `
		SELECT id, folder_id, title, content, is_pinned, is_archived, is_deleted, color, cover_image, tags, attachments, created_at, updated_at, server_updated_at
		FROM notes
		WHERE user_id=$1 AND server_updated_at > $2`
	var rows *sql.Rows
	var err error
	if limit > 0 {
		rows, err = r.db.QueryContext(ctx, notesQuery+" LIMIT $3", userID, since, limit)
	} else {
		rows, err = r.db.QueryContext(ctx, notesQuery, userID, since)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var n model.NoteDTO
		var folderID, color, cover sql.NullString
		var serverUpdatedAt sql.NullTime
		err := rows.Scan(&n.ID, &folderID, &n.Title, &n.Content, &n.IsPinned, &n.IsArchived, &n.IsDeleted,
			&color, &cover, &n.Tags, &n.Attachments, &n.CreatedAt, &n.UpdatedAt, &serverUpdatedAt)
		if err != nil {
			log.Println("Scan error note:", err)
			continue
		}

		if folderID.Valid {
			n.FolderID = &folderID.String
		}
		n.Color = color.String
		n.CoverImage = cover.String
		if serverUpdatedAt.Valid {
			n.ServerUpdatedAt = serverUpdatedAt.Time
		} else {
			n.ServerUpdatedAt = n.UpdatedAt
		}
		resp.Notes = append(resp.Notes, n)
	}

	// 2. FOLDERS
	foldersQuery := `
		SELECT id, parent_id, name, color, is_deleted, updated_at, server_updated_at
		FROM folders
		WHERE user_id=$1 AND server_updated_at > $2`
	var fRows *sql.Rows
	if limit > 0 {
		fRows, err = r.db.QueryContext(ctx, foldersQuery+" LIMIT $3", userID, since, limit)
	} else {
		fRows, err = r.db.QueryContext(ctx, foldersQuery, userID, since)
	}
	if err != nil {
		return nil, err
	}
	defer fRows.Close()

	for fRows.Next() {
		var f model.FolderDTO
		var parentID, color sql.NullString
		var serverUpdatedAt sql.NullTime
		fRows.Scan(&f.ID, &parentID, &f.Name, &color, &f.IsDeleted, &f.UpdatedAt, &serverUpdatedAt)
		if parentID.Valid {
			f.ParentID = &parentID.String
		}
		f.Color = color.String
		if serverUpdatedAt.Valid {
			f.ServerUpdatedAt = serverUpdatedAt.Time
		} else {
			f.ServerUpdatedAt = f.UpdatedAt
		}
		resp.Folders = append(resp.Folders, f)
	}

	// 3. FILES
	filesQuery := `
		SELECT id, note_id, name, type, size, s3_key, created_at, updated_at, server_updated_at
		FROM files
		WHERE user_id=$1 AND server_updated_at > $2`
	var flRows *sql.Rows
	if limit > 0 {
		flRows, err = r.db.QueryContext(ctx, filesQuery+" LIMIT $3", userID, since, limit)
	} else {
		flRows, err = r.db.QueryContext(ctx, filesQuery, userID, since)
	}
	if err != nil {
		return nil, err
	}
	defer flRows.Close()

	for flRows.Next() {
		var f model.FileDTO
		var noteID, s3Key sql.NullString
		var serverUpdatedAt sql.NullTime
		flRows.Scan(&f.ID, &noteID, &f.Name, &f.Type, &f.Size, &s3Key, &f.CreatedAt, &f.UpdatedAt, &serverUpdatedAt)
		if noteID.Valid {
			f.NoteID = &noteID.String
		}
		if s3Key.Valid {
			f.S3Key = &s3Key.String
		}
		if serverUpdatedAt.Valid {
			f.ServerUpdatedAt = serverUpdatedAt.Time
		} else {
			f.ServerUpdatedAt = f.UpdatedAt
		}
		resp.Files = append(resp.Files, f)
	}

	// 4. TAGS
	tagsQuery := `
		SELECT id, name, color, updated_at, server_updated_at
		FROM tags
		WHERE user_id=$1 AND server_updated_at > $2`
	var tRows *sql.Rows
	if limit > 0 {
		tRows, err = r.db.QueryContext(ctx, tagsQuery+" LIMIT $3", userID, since, limit)
	} else {
		tRows, err = r.db.QueryContext(ctx, tagsQuery, userID, since)
	}
	if err != nil {
		return nil, err
	}
	defer tRows.Close()

	for tRows.Next() {
		var t model.TagDTO
		var color sql.NullString
		var serverUpdatedAt sql.NullTime
		tRows.Scan(&t.ID, &t.Name, &color, &t.UpdatedAt, &serverUpdatedAt)
		t.Color = color.String
		if serverUpdatedAt.Valid {
			t.ServerUpdatedAt = serverUpdatedAt.Time
		} else {
			t.ServerUpdatedAt = t.UpdatedAt
		}
		resp.Tags = append(resp.Tags, t)
	}

	return resp, nil
}

// DeleteNote перманентно удаляет заметку
func (r *DataRepository) DeleteNote(ctx context.Context, userID, noteID string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM notes WHERE id = $1 AND user_id = $2", noteID, userID)
	return err
}

// ==================== FILE OPERATIONS ====================

// CommitFileRecord подтверждает загрузку файла в S3
func (r *DataRepository) CommitFileRecord(ctx context.Context, userID, id, s3Key string, size int64) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO files (id, user_id, s3_key, size, is_uploaded, created_at, updated_at)
		VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET
			s3_key = EXCLUDED.s3_key,
			size = EXCLUDED.size,
			is_uploaded = TRUE,
			updated_at = NOW()
		WHERE files.user_id = $2
	`, id, userID, s3Key, size)
	return err
}

// GetNoteFileKeys возвращает ключи S3 всех файлов заметки (для удаления)
func (r *DataRepository) GetNoteFileKeys(ctx context.Context, userID, noteID string) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT s3_key FROM files WHERE note_id = $1 AND user_id = $2", noteID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var key sql.NullString
		if err := rows.Scan(&key); err == nil && key.Valid {
			keys = append(keys, key.String)
		}
	}
	return keys, nil
}