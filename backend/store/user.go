package store

import (
	"context"
	"database/sql"
	"log"
	"time"

	"noteflow/model"

	"github.com/minio/minio-go/v7"
)

// UserRepository объединяет все операции с пользователями, подписками, транзакциями и очисткой
type UserRepository struct {
	db    *sql.DB
	minio *minio.Client
}

func NewUserRepository(db *sql.DB, minioClient *minio.Client) *UserRepository {
	return &UserRepository{
		db:    db,
		minio: minioClient,
	}
}

// ==================== USER OPERATIONS ====================

// CreateUser создает нового пользователя
func (r *UserRepository) CreateUser(email, passwordHash string) (string, error) {
	var id string
	err := r.db.QueryRow(`
		INSERT INTO users (email, password_hash) 
		VALUES ($1, $2) 
		RETURNING id`, email, passwordHash).Scan(&id)
	return id, err
}

// GetUserByEmail используется для логина
func (r *UserRepository) GetUserByEmail(email string) (string, string, error) {
	var id, hash string
	err := r.db.QueryRow("SELECT id, password_hash FROM users WHERE email=$1", email).Scan(&id, &hash)
	return id, hash, err
}

// GetUserProfile возвращает профиль пользователя с информацией о подписке
func (r *UserRepository) GetUserProfile(userID string) (model.UserProfile, error) {
	var tier, email string
	var storageLimit, storageUsed int64
	var subscriptionExpiresAt, freeSince sql.NullTime

	err := r.db.QueryRow(`
		SELECT
			u.tier,
			u.storage_limit,
			u.subscription_expires_at,
			u.free_since,
			u.email,
			COALESCE(SUM(f.size), 0) as storage_used
		FROM users u
		LEFT JOIN files f ON f.user_id = u.id AND f.is_uploaded = TRUE
		WHERE u.id = $1
		GROUP BY u.id, u.tier, u.storage_limit, u.subscription_expires_at, u.free_since, u.email
	`, userID).Scan(&tier, &storageLimit, &subscriptionExpiresAt, &freeSince, &email, &storageUsed)

	if err != nil {
		return model.UserProfile{}, err
	}

	profile := model.NewUserProfile(userID, tier, storageLimit, storageUsed, subscriptionExpiresAt, freeSince)
	profile.Email = email
	return profile, nil
}

// GetUserTier возвращает тариф пользователя
func (r *UserRepository) GetUserTier(userID string) (string, *time.Time, *time.Time, error) {
	var tier string
	var subscriptionExpiresAt, freeSince sql.NullTime

	err := r.db.QueryRow(`
		SELECT tier, subscription_expires_at, free_since 
		FROM users 
		WHERE id = $1
	`, userID).Scan(&tier, &subscriptionExpiresAt, &freeSince)

	if err != nil {
		return "", nil, nil, err
	}

	var expiresAt *time.Time
	if subscriptionExpiresAt.Valid {
		expiresAt = &subscriptionExpiresAt.Time
	}

	var freeSincePtr *time.Time
	if freeSince.Valid {
		freeSincePtr = &freeSince.Time
	}

	return tier, expiresAt, freeSincePtr, nil
}

// UpdateUserTier обновляет тариф пользователя
func (r *UserRepository) UpdateUserTier(userID, tier string, expiresAt time.Time) error {
	_, err := r.db.Exec(`
		UPDATE users 
		SET tier = $2, 
		    subscription_expires_at = $3,
		    free_since = CASE 
		        WHEN $2 = 'free' THEN COALESCE(free_since, NOW())
		        ELSE NULL 
		    END
		WHERE id = $1
	`, userID, tier, expiresAt)
	return err
}

// GetUserStorageStats возвращает лимит и использованное место
func (r *UserRepository) GetUserStorageStats(userID string) (int64, int64) {
	var limit int64
	err := r.db.QueryRow("SELECT storage_limit FROM users WHERE id=$1", userID).Scan(&limit)
	if err != nil {
		limit = 1073741824 // 1 GB fallback
	}
	var filesUsed sql.NullInt64
	r.db.QueryRow("SELECT SUM(size) FROM files WHERE user_id=$1 AND is_uploaded = TRUE", userID).Scan(&filesUsed)
	return limit, filesUsed.Int64
}

// ==================== SUBSCRIPTION OPERATIONS ====================

// GetUsersWithExpiredSubscriptions возвращает ID пользователей с истекшей подпиской
func (r *UserRepository) GetUsersWithExpiredSubscriptions() ([]string, error) {
	rows, err := r.db.Query(`
		SELECT id 
		FROM users 
		WHERE tier != 'free' 
		  AND subscription_expires_at IS NOT NULL 
		  AND subscription_expires_at < NOW()
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		userIDs = append(userIDs, userID)
	}

	return userIDs, nil
}

// ==================== TRANSACTION OPERATIONS ====================

// CreateTransaction создает запись о транзакции
func (r *UserRepository) CreateTransaction(tx *model.Transaction) error {
	_, err := r.db.Exec(`
		INSERT INTO transactions (id, user_id, payment_id, tier, amount, currency, status, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, tx.ID, tx.UserID, tx.PaymentID, string(tx.Tier), tx.Amount, tx.Currency, string(tx.Status), tx.Metadata, tx.CreatedAt, tx.UpdatedAt)
	return err
}

// GetTransactionByPaymentID возвращает транзакцию по payment_id
func (r *UserRepository) GetTransactionByPaymentID(paymentID string) (*model.Transaction, error) {
	var tx model.Transaction
	var tierStr, statusStr string
	var metadata []byte

	err := r.db.QueryRow(`
		SELECT id, user_id, payment_id, tier, amount, currency, status, metadata, created_at, updated_at
		FROM transactions
		WHERE payment_id = $1
	`, paymentID).Scan(&tx.ID, &tx.UserID, &tx.PaymentID, &tierStr, &tx.Amount, &tx.Currency, &statusStr, &metadata, &tx.CreatedAt, &tx.UpdatedAt)

	if err != nil {
		return nil, err
	}

	tx.Tier = model.UserTier(tierStr)
	tx.Status = model.TransactionStatus(statusStr)
	tx.Metadata = metadata

	return &tx, nil
}

// UpdateTransactionStatus обновляет статус транзакции
func (r *UserRepository) UpdateTransactionStatus(paymentID, status string) error {
	_, err := r.db.Exec(`
		UPDATE transactions 
		SET status = $2, updated_at = NOW()
		WHERE payment_id = $1
	`, paymentID, status)
	return err
}

// ==================== CLEANUP OPERATIONS ====================

// GetUsersForCleanup возвращает ID пользователей на тарифе free более указанного количества дней
func (r *UserRepository) GetUsersForCleanup(days int) ([]string, error) {
	rows, err := r.db.Query(`
		SELECT id 
		FROM users 
		WHERE tier = 'free' 
		  AND free_since IS NOT NULL 
		  AND free_since < NOW() - INTERVAL '1 day' * $1
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		userIDs = append(userIDs, userID)
	}
	return userIDs, nil
}

// DeleteUserFiles удаляет все файлы пользователя из S3
func (r *UserRepository) DeleteUserFiles(ctx context.Context, bucket, userID string) error {
	rows, err := r.db.QueryContext(ctx, `
		SELECT s3_key
		FROM files
		WHERE user_id = $1 AND s3_key IS NOT NULL
	`, userID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var s3Key string
		if err := rows.Scan(&s3Key); err != nil {
			continue
		}
		// Удаляем файл из S3
		if err := r.minio.RemoveObject(ctx, bucket, s3Key, minio.RemoveObjectOptions{}); err != nil {
			log.Printf("Failed to delete file from S3: %s, error: %v", s3Key, err)
		}
	}

	// Обновляем записи файлов
	_, err = r.db.ExecContext(ctx, `
		UPDATE files
		SET s3_key = NULL, is_uploaded = FALSE
		WHERE user_id = $1
	`, userID)
	return err
}

// CleanupExpiredData удаляет данные пользователей с истекшими подписками
func (r *UserRepository) CleanupExpiredData(ctx context.Context, bucket string) error {
	// Получаем пользователей с истекшими подписками
	userIDs, err := r.GetUsersWithExpiredSubscriptions()
	if err != nil {
		return err
	}

	for _, userID := range userIDs {
		// Удаляем файлы из S3
		if err := r.DeleteUserFiles(ctx, bucket, userID); err != nil {
			log.Printf("Failed to delete files for user %s: %v", userID, err)
			continue
		}
		// Помечаем пользователя как free
		if err := r.UpdateUserTier(userID, "free", time.Now()); err != nil {
			log.Printf("Failed to downgrade user %s: %v", userID, err)
		}
	}
	return nil
}