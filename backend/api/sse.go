// api/sse.go
package api

import (
	"sync"
	"time"
)

type SSEBroker struct {
	// Map: UserID -> Map of Client Channels -> last active time
	clients map[string]map[chan struct{}]time.Time
	mu      sync.RWMutex
	// Timeout duration for clients: if no heartbeat after this, client is removed
	timeout time.Duration
	stop    chan struct{}
	// Max devices per user (0 = unlimited)
	maxDevicesPerUser int
	// Global connection limit (0 = unlimited)
	maxTotalConnections int
	// Semaphore for global limit (nil if maxTotalConnections == 0)
	sem chan struct{}
}

func NewSSEBroker() *SSEBroker {
	broker := &SSEBroker{
		clients:              make(map[string]map[chan struct{}]time.Time),
		timeout:              time.Minute * 5, // default timeout 5 minutes
		stop:                 make(chan struct{}),
		maxDevicesPerUser:    3,  // по умолчанию не более 5 устройств на пользователя
		maxTotalConnections:  0,  // по умолчанию нет глобального лимита (0 = unlimited)
		sem:                  nil, // будет инициализирован только если maxTotalConnections > 0
	}
	// Инициализируем семафор, если лимит задан
	if broker.maxTotalConnections > 0 {
		broker.sem = make(chan struct{}, broker.maxTotalConnections)
	}
	go broker.backgroundTasks()
	return broker
}

// NewSSEBrokerWithTimeout creates a broker with a custom timeout
func NewSSEBrokerWithTimeout(timeout time.Duration) *SSEBroker {
	broker := &SSEBroker{
		clients:              make(map[string]map[chan struct{}]time.Time),
		timeout:              timeout,
		stop:                 make(chan struct{}),
		maxDevicesPerUser:    5,
		maxTotalConnections:  0, // по умолчанию нет глобального лимита
		sem:                  nil,
	}
	if broker.maxTotalConnections > 0 {
		broker.sem = make(chan struct{}, broker.maxTotalConnections)
	}
	go broker.backgroundTasks()
	return broker
}

// Subscribe создает канал для конкретного клиента и возвращает его
func (b *SSEBroker) Subscribe(userID string) chan struct{} {
	// Глобальный лимит (если задан)
	if b.sem != nil {
		b.sem <- struct{}{}
	}
	
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, ok := b.clients[userID]; !ok {
		b.clients[userID] = make(map[chan struct{}]time.Time)
	}

	// Проверяем лимит устройств на пользователя
	if b.maxDevicesPerUser > 0 && len(b.clients[userID]) >= b.maxDevicesPerUser {
		// Достигнут лимит – закрываем самое старое соединение
		var oldestChan chan struct{}
		var oldestTime time.Time
		for ch, t := range b.clients[userID] {
			if oldestChan == nil || t.Before(oldestTime) {
				oldestChan = ch
				oldestTime = t
			}
		}
		if oldestChan != nil {
			delete(b.clients[userID], oldestChan)
			close(oldestChan)
			// Освобождаем слот глобального лимита, если он был занят этим соединением
			if b.sem != nil {
				select {
				case <-b.sem:
					// успешно извлекли
				default:
					// не должно происходить
				}
			}
		}
	}

	// Создаем буферизированный канал (размер 1), чтобы не блокировать отправку
	ch := make(chan struct{}, 1)
	b.clients[userID][ch] = time.Now()
	return ch
}

// Unsubscribe удаляет канал
func (b *SSEBroker) Unsubscribe(userID string, ch chan struct{}) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if userClients, ok := b.clients[userID]; ok {
		if _, ok := userClients[ch]; ok {
			delete(userClients, ch)
			close(ch)
			if len(userClients) == 0 {
				delete(b.clients, userID)
			}
			// Освобождаем слот глобального лимита
			if b.sem != nil {
				select {
				case <-b.sem:
					// успешно извлекли
				default:
					// не должно происходить
				}
			}
		}
	}
}

// Notify отправляет сигнал всем устройствам пользователя
func (b *SSEBroker) Notify(userID string) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if userClients, ok := b.clients[userID]; ok {
		for ch := range userClients {
			select {
			case ch <- struct{}{}:
				// signal sent, update last active time
				b.mu.Lock()
				if _, ok := b.clients[userID][ch]; ok {
					b.clients[userID][ch] = time.Now()
				}
				b.mu.Unlock()
			default:
				// Если канал полон (клиент еще не обработал предыдущий сигнал), пропускаем
				// This is safe; client may be slow but still alive
			}
		}
	}
}

// backgroundTasks runs heartbeat and cleanup in a single goroutine
func (b *SSEBroker) backgroundTasks() {
	heartbeatTicker := time.NewTicker(b.timeout / 2)
	defer heartbeatTicker.Stop()
	cleanupTicker := time.NewTicker(b.timeout)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-b.stop:
			return
		case <-heartbeatTicker.C:
			b.sendHeartbeats()
		case <-cleanupTicker.C:
			b.cleanupStaleClients()
		}
	}
}

// sendHeartbeats sends a heartbeat to all clients
func (b *SSEBroker) sendHeartbeats() {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	for userID, userClients := range b.clients {
		for ch, lastActive := range userClients {
			// Если клиент был активен недавно (меньше чем timeout/2), можно пропустить heartbeat
			if now.Sub(lastActive) < b.timeout/2 {
				continue
			}
			select {
			case ch <- struct{}{}:
				// heartbeat sent, update last active time
				b.clients[userID][ch] = now
			default:
				// channel full, client may be dead; leave for cleanup
			}
		}
	}
}

// cleanupStaleClients removes clients that have been inactive beyond timeout
func (b *SSEBroker) cleanupStaleClients() {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	for userID, userClients := range b.clients {
		for ch, lastActive := range userClients {
			if now.Sub(lastActive) > b.timeout {
				delete(userClients, ch)
				close(ch)
				// Освобождаем слот глобального лимита
				if b.sem != nil {
					select {
					case <-b.sem:
						// успешно извлекли
					default:
						// не должно происходить
					}
				}
			}
		}
		// Remove empty user entries
		if len(userClients) == 0 {
			delete(b.clients, userID)
		}
	}
}

// Stop прекращает фоновые задачи (для graceful shutdown)
func (b *SSEBroker) Stop() {
	close(b.stop)
}
