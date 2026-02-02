/* init.sql */

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'start', 'medium', 'ultra')),
    storage_limit BIGINT NOT NULL DEFAULT 0, -- Will be set based on tier
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    free_since TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_subscription_expires ON users(subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_free_since ON users(free_since);

-- Транзакции оплаты
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_id TEXT UNIQUE NOT NULL, -- YooKassa payment ID
    tier TEXT NOT NULL CHECK (tier IN ('start', 'medium', 'ultra')),
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled', 'failed')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Заметки
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID,
    title TEXT,
    content TEXT,
    size BIGINT DEFAULT 0,
    
    -- Метаданные
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    
    -- Внешний вид
    color TEXT,
    cover_image TEXT,

    -- JSONB
    tags JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at);

-- Папки
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID,
    name TEXT,
    color TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_user_updated ON folders(user_id, updated_at);

-- Теги
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT,
    color TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_user_updated ON tags(user_id, updated_at);

-- Файлы
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id UUID,
    name TEXT,
    type TEXT,
    size BIGINT,
    s3_key TEXT,
    is_uploaded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_user_updated ON files(user_id, updated_at);

-- Добавь это в init.sql

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    client_ip TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Функция для обновления storage_limit на основе tier
CREATE OR REPLACE FUNCTION update_user_storage_limit()
RETURNS TRIGGER AS $$
BEGIN
    -- Устанавливаем лимит хранилища в зависимости от тарифа (используем BIGINT)
    CASE NEW.tier
        WHEN 'free' THEN
            NEW.storage_limit := 0; -- Бесплатный тариф: нет облачного хранилища
        WHEN 'start' THEN
            NEW.storage_limit := 5::bigint * 1024 * 1024 * 1024; -- 5 GB
        WHEN 'medium' THEN
            NEW.storage_limit := 50::bigint * 1024 * 1024 * 1024; -- 50 GB
        WHEN 'ultra' THEN
            NEW.storage_limit := 200::bigint * 1024 * 1024 * 1024; -- 200 GB
        ELSE
            NEW.storage_limit := 0;
    END CASE;
    
    -- Обновляем free_since при изменении тарифа
    IF NEW.tier = 'free' AND (OLD.tier IS NULL OR OLD.tier != 'free') THEN
        NEW.free_since := NOW();
    ELSIF NEW.tier != 'free' THEN
        NEW.free_since := NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления storage_limit при изменении tier
DROP TRIGGER IF EXISTS trigger_update_storage_limit ON users;
CREATE TRIGGER trigger_update_storage_limit
    BEFORE INSERT OR UPDATE OF tier ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_user_storage_limit();

-- Инициализируем storage_limit для существующих пользователей

-- ==================== SERVER TIMESTAMP SOLUTION ====================

-- Добавляем колонку server_updated_at для синхронизации по серверному времени
ALTER TABLE notes ADD COLUMN IF NOT EXISTS server_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE folders ADD COLUMN IF NOT EXISTS server_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE tags ADD COLUMN IF NOT EXISTS server_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE files ADD COLUMN IF NOT EXISTS server_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Создаем индексы для оптимизации запросов синхронизации
CREATE INDEX IF NOT EXISTS idx_notes_user_server_updated ON notes(user_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_folders_user_server_updated ON folders(user_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_tags_user_server_updated ON tags(user_id, server_updated_at);
CREATE INDEX IF NOT EXISTS idx_files_user_server_updated ON files(user_id, server_updated_at);

-- Функция триггера для обновления server_updated_at
CREATE OR REPLACE FUNCTION update_server_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.server_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры для каждой таблицы
DROP TRIGGER IF EXISTS trigger_notes_server_updated ON notes;
CREATE TRIGGER trigger_notes_server_updated
    BEFORE INSERT OR UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_server_updated_at();

DROP TRIGGER IF EXISTS trigger_folders_server_updated ON folders;
CREATE TRIGGER trigger_folders_server_updated
    BEFORE INSERT OR UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_server_updated_at();

DROP TRIGGER IF EXISTS trigger_tags_server_updated ON tags;
CREATE TRIGGER trigger_tags_server_updated
    BEFORE INSERT OR UPDATE ON tags
    FOR EACH ROW
    EXECUTE FUNCTION update_server_updated_at();

DROP TRIGGER IF EXISTS trigger_files_server_updated ON files;
CREATE TRIGGER trigger_files_server_updated
    BEFORE INSERT OR UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_server_updated_at();

-- Заполняем server_updated_at существующих записей значением updated_at
UPDATE notes SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
UPDATE folders SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
UPDATE tags SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
UPDATE files SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
