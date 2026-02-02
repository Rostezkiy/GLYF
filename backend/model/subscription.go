package model

import (
	"database/sql"
	"encoding/json"
	"time"
)

// UserTier represents subscription tier
type UserTier string

const (
	TierFree   UserTier = "free"
	TierStart  UserTier = "start"
	TierMedium UserTier = "medium"
	TierUltra  UserTier = "ultra"
)

// IsValidTier checks if tier is valid
func IsValidTier(tier string) bool {
	switch UserTier(tier) {
	case TierFree, TierStart, TierMedium, TierUltra:
		return true
	default:
		return false
	}
}

// GetTierLimits returns storage limit and max file size for a tier
func GetTierLimits(tier UserTier) (storageLimit int64, maxFileSize int64) {
	switch tier {
	case TierFree:
		return 0, 0 // No cloud storage for free tier
	case TierStart:
		return 5 * 1024 * 1024 * 1024, // 5 GB
			100 * 1024 * 1024 // 100 MB
	case TierMedium:
		return 50 * 1024 * 1024 * 1024, // 50 GB
			500 * 1024 * 1024 // 500 MB
	case TierUltra:
		return 200 * 1024 * 1024 * 1024, // 200 GB
			5 * 1024 * 1024 * 1024 // 5 GB
	default:
		return 0, 0
	}
}

// HasSyncAccess returns true if tier has sync access
func (t UserTier) HasSyncAccess() bool {
	return t != TierFree
}

// TransactionStatus represents payment transaction status
type TransactionStatus string

const (
	TransactionPending   TransactionStatus = "pending"
	TransactionSucceeded TransactionStatus = "succeeded"
	TransactionCanceled  TransactionStatus = "canceled"
	TransactionFailed    TransactionStatus = "failed"
)

// Transaction represents a payment transaction
type Transaction struct {
	ID        string            `json:"id"`
	UserID    string            `json:"userId"`
	PaymentID string            `json:"paymentId"`
	Tier      UserTier          `json:"tier"`
	Amount    float64           `json:"amount"`
	Currency  string            `json:"currency"`
	Status    TransactionStatus `json:"status"`
	Metadata  json.RawMessage   `json:"metadata"`
	CreatedAt time.Time         `json:"createdAt"`
	UpdatedAt time.Time         `json:"updatedAt"`
}

// UserProfile represents user subscription profile
type UserProfile struct {
	UserID                string     `json:"userId"`
	Email       		  string `json:"email"`
	Tier                  UserTier   `json:"tier"`
	StorageLimit          int64      `json:"storageLimit"`
	MaxFileSize           int64      `json:"maxFileSize"`
	StorageUsed           int64      `json:"storageUsed"`
	SubscriptionExpiresAt *time.Time `json:"subscriptionExpiresAt,omitempty"`
	FreeSince             *time.Time `json:"freeSince,omitempty"`
	CleanupWarningDate    *time.Time `json:"cleanupWarningDate,omitempty"` // Date when files will be deleted (free_since + 90 days)
	HasSyncAccess         bool       `json:"hasSyncAccess"`
}

// NewUserProfile creates a UserProfile from database fields
func NewUserProfile(userID string, tier string, storageLimit, storageUsed int64,
	subscriptionExpiresAt, freeSince sql.NullTime) UserProfile {

	userTier := UserTier(tier)
	storageLimit, maxFileSize := GetTierLimits(userTier)

	var cleanupWarningDate *time.Time
	if freeSince.Valid && userTier == TierFree {
		warningDate := freeSince.Time.Add(90 * 24 * time.Hour)
		cleanupWarningDate = &warningDate
	}

	var expiresAt *time.Time
	if subscriptionExpiresAt.Valid {
		expiresAt = &subscriptionExpiresAt.Time
	}

	var freeSincePtr *time.Time
	if freeSince.Valid {
		freeSincePtr = &freeSince.Time
	}

	return UserProfile{
		UserID:                userID,
		Tier:                  userTier,
		StorageLimit:          storageLimit,
		MaxFileSize:           maxFileSize,
		StorageUsed:           storageUsed,
		SubscriptionExpiresAt: expiresAt,
		FreeSince:             freeSincePtr,
		CleanupWarningDate:    cleanupWarningDate,
		HasSyncAccess:         userTier.HasSyncAccess(),
	}
}

// SubscriptionPlan represents a subscription plan for display
type SubscriptionPlan struct {
	Tier        UserTier `json:"tier"`
	Name        string   `json:"name"`
	Price       float64  `json:"price"`
	Currency    string   `json:"currency"`
	Storage     string   `json:"storage"`
	MaxFileSize string   `json:"maxFileSize"`
	Features    []string `json:"features"`
}

// GetSubscriptionPlans returns available subscription plans
func GetSubscriptionPlans() []SubscriptionPlan {
	return []SubscriptionPlan{
		{
			Tier:        TierStart,
			Name:        "Start",
			Price:       99.0,
			Currency:    "RUB",
			Storage:     "5 GB",
			MaxFileSize: "100 MB",
			Features:    []string{"Синхронизация между устройствами", "Облачное хранилище 5 GB", "Максимальный размер файла 100 MB"},
		},
		{
			Tier:        TierMedium,
			Name:        "Medium",
			Price:       299.0,
			Currency:    "RUB",
			Storage:     "50 GB",
			MaxFileSize: "500 MB",
			Features:    []string{"Синхронизация между устройствами", "Облачное хранилище 50 GB", "Максимальный размер файла 500 MB", "Приоритетная поддержка"},
		},
		{
			Tier:        TierUltra,
			Name:        "Ultra",
			Price:       999.0,
			Currency:    "RUB",
			Storage:     "200 GB",
			MaxFileSize: "5 GB",
			Features:    []string{"Синхронизация между устройствами", "Облачное хранилище 200 GB", "Максимальный размер файла 5 GB", "Приоритетная поддержка", "Резервное копирование"},
		},
	}
}
