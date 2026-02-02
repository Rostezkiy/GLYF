// api/subscription.go
package api

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"noteflow/model"

	"github.com/google/uuid"
)

// HandleGetUserProfile возвращает профиль пользователя с информацией о подписке
func (h *Handler) HandleGetUserProfile(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	profile, err := h.Store.UserRepository.GetUserProfile(userID)
	if err != nil {
		http.Error(w, "Failed to get user profile", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profile)
}

// HandleGetSubscriptionPlans возвращает доступные тарифные планы
func (h *Handler) HandleGetSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	plans := model.GetSubscriptionPlans()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(plans)
}

// HandleCreatePayment создает платежную транзакцию (заглушка для YooKassa)
func (h *Handler) HandleCreatePayment(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Tier string `json:"tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Проверяем валидность тарифа
	if !model.IsValidTier(req.Tier) || req.Tier == "free" {
		http.Error(w, "Invalid tier", http.StatusBadRequest)
		return
	}

	// Получаем информацию о тарифе для определения цены
	var price float64
	switch model.UserTier(req.Tier) {
	case model.TierStart:
		price = 99.0
	case model.TierMedium:
		price = 299.0
	case model.TierUltra:
		price = 999.0
	default:
		http.Error(w, "Invalid tier", http.StatusBadRequest)
		return
	}

	// Генерируем уникальный ID платежа
	paymentID := "yookassa_test_" + uuid.New().String()

	// Создаем транзакцию
	transaction := &model.Transaction{
		ID:        uuid.New().String(),
		UserID:    userID,
		PaymentID: paymentID,
		Tier:      model.UserTier(req.Tier),
		Amount:    price,
		Currency:  "RUB",
		Status:    model.TransactionPending,
		Metadata:  json.RawMessage(`{"test": true}`),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Сохраняем транзакцию в БД
	if err := h.Store.UserRepository.CreateTransaction(transaction); err != nil {
		log.Printf("Failed to create transaction: %v", err)
		http.Error(w, "Failed to create payment", http.StatusInternalServerError)
		return
	}

	// В реальной реализации здесь был бы вызов API YooKassa
	// и возврат confirmation_url для редиректа пользователя
	// Для заглушки возвращаем тестовые данные
	response := map[string]interface{}{
		"paymentId":       paymentID,
		"confirmationUrl": "https://yookassa.test/confirmation/" + paymentID,
		"amount":          price,
		"currency":        "RUB",
		"test":            true,
		"message":         "Это заглушка. В рабочем окружении здесь будет реальный вызов YooKassa API",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleWebhook обрабатывает вебхук от YooKassa
func (h *Handler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	// В реальной реализации нужно проверять подпись вебхука
	// Для заглушки просто принимаем запрос

	var webhookData struct {
		Event  string `json:"event"`
		Object struct {
			ID       string                 `json:"id"`
			Status   string                 `json:"status"`
			Metadata map[string]interface{} `json:"metadata"`
		} `json:"object"`
	}

	if err := json.NewDecoder(r.Body).Decode(&webhookData); err != nil {
		http.Error(w, "Invalid webhook data", http.StatusBadRequest)
		return
	}

	paymentID := webhookData.Object.ID
	if paymentID == "" {
		http.Error(w, "Missing payment ID", http.StatusBadRequest)
		return
	}

	// Получаем транзакцию по payment_id
	transaction, err := h.Store.UserRepository.GetTransactionByPaymentID(paymentID)
	if err != nil {
		log.Printf("Transaction not found for payment ID: %s", paymentID)
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	// Обновляем статус транзакции
	newStatus := webhookData.Object.Status
	if err := h.Store.UserRepository.UpdateTransactionStatus(paymentID, newStatus); err != nil {
		log.Printf("Failed to update transaction status: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Если платеж успешен, обновляем тариф пользователя
	if newStatus == string(model.TransactionSucceeded) {
		// Устанавливаем срок подписки (30 дней от текущей даты)
		expiresAt := time.Now().Add(30 * 24 * time.Hour)

		if err := h.Store.UserRepository.UpdateUserTier(transaction.UserID, string(transaction.Tier), expiresAt); err != nil {
			log.Printf("Failed to update user tier: %v", err)
			// Не прерываем выполнение, так как транзакция уже обновлена
		}

		log.Printf("User %s upgraded to tier %s", transaction.UserID, transaction.Tier)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// HandleUpgradeTier обновляет тариф пользователя (для тестирования)
func (h *Handler) HandleUpgradeTier(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Tier      string    `json:"tier"`
		ExpiresAt time.Time `json:"expiresAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if !model.IsValidTier(req.Tier) {
		http.Error(w, "Invalid tier", http.StatusBadRequest)
		return
	}

	if err := h.Store.UserRepository.UpdateUserTier(userID, req.Tier, req.ExpiresAt); err != nil {
		http.Error(w, "Failed to update tier", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success",
		"tier":   req.Tier,
	})
}

// verifyWebhookSignature проверяет подпись вебхука от YooKassa
func verifyWebhookSignature(secret, signature string, body []byte) bool {
	// В реальной реализации нужно использовать секрет от YooKassa
	// Для заглушки всегда возвращаем true
	return true

	// Пример реальной реализации:
	// h := hmac.New(sha256.New, []byte(secret))
	// h.Write(body)
	// expectedSignature := hex.EncodeToString(h.Sum(nil))
	// return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

// updateTierBasedStorageLimits обновляет лимиты хранилища на основе тарифа
func (h *Handler) updateTierBasedStorageLimits() {
	// Эта функция может быть вызвана из фоновой горутины
	// для периодического обновления лимитов
	// В текущей реализации лимиты обновляются автоматически через триггер в БД
}
