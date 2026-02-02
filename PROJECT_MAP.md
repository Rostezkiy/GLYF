# Glyf Project Map

Complete guide to the project structure and responsibilities of each file.

---

## Backend (Go)

### Entry Point
- **[`main.go`](backend/main.go)** - Application entry point, router setup, middleware configuration, server initialization

### API Layer (HTTP Handlers)
- **[`api/handler.go`](backend/api/handler.go)** - Handler struct initialization, helper functions
- **[`api/auth.go`](backend/api/auth.go)** - Login, register, refresh token endpoints
- **[`api/sync.go`](backend/api/sync.go)** - Push/pull sync endpoints, SSE event handling
- **[`api/files.go`](backend/api/files.go)** - File upload/download, presigned URL generation
- **[`api/subscription.go`](backend/api/subscription.go)** - Subscription plans, payment creation, webhooks
- **[`api/sse.go`](backend/api/sse.go)** - SSE broker for real-time sync notifications

### Data Models
- **[`model/types.go`](backend/model/types.go)** - DTOs for notes, folders, files, tags, sync payload
- **[`model/subscription.go`](backend/model/subscription.go)** - ⭐ **Single source of truth for subscription tiers, limits, and plans**

### Data Layer (Repositories)
- **[`store/pg.go`](backend/store/pg.go)** - Store facade, database connection, delegates to repositories
- **[`store/user.go`](backend/store/user.go)** - User CRUD, authentication, subscription management, transaction operations, cleanup operations
- **[`store/data.go`](backend/store/data.go)** - Sync data operations (push/pull), file metadata operations
- **[`store/s3.go`](backend/store/s3.go)** - MinIO/S3 storage operations

### Middleware
- **[`middleware.go`](backend/middleware.go)** - Authentication, CORS, rate limiting, security headers

### Database
- **[`init.sql`](backend/init.sql)** - Database schema initialization

---

## Frontend (Svelte)

### Configuration
- **[`src/lib/config.js`](frontend/src/lib/config.js)** - ⭐ **Centralized configuration (API URLs, constants, storage keys)**

### Core Services
- **[`src/lib/db.js`](frontend/src/lib/db.js)** - Dexie IndexedDB setup, dbService with CRUD operations
- **[`src/lib/auth.js`](frontend/src/lib/auth.js)** - Authentication, session management, user store
- **[`src/lib/crypto.js`](frontend/src/lib/crypto.js)** - E2E encryption key derivation and management

### Business Logic Services
- **[`src/lib/services/noteService.js`](frontend/src/lib/services/noteService.js)** - Note CRUD operations, triggers sync
- **[`src/lib/services/folderService.js`](frontend/src/lib/services/folderService.js)** - Folder CRUD operations, triggers sync
- **[`src/lib/services/tagService.js`](frontend/src/lib/services/tagService.js)** - Tag CRUD operations, triggers sync
- **[`src/lib/services/fileService.js`](frontend/src/lib/services/fileService.js)** - File attachment handling
- **[`src/lib/services/syncService.js`](frontend/src/lib/services/syncService.js)** - ⭐ **Main sync orchestrator (push/pull, SSE, debouncing, S3 operations, encryption)**
- **[`src/lib/services/mediaResolver.js`](frontend/src/lib/services/mediaResolver.js)** - Media resolution and processing
- **[`src/lib/services/uiStore.js`](frontend/src/lib/services/uiStore.js)** - UI state management (view mode, theme, filters, sidebar, modals)

### State Management (Svelte Stores)
- **Note**: Stores are integrated within services; there is no separate `stores/` directory. UI state is managed by `uiStore.js`.

### UI Components

#### Layout Components
- **[`src/lib/components/Header.svelte`](frontend/src/lib/components/Header.svelte)** - Top navigation, search, user menu
- **[`src/lib/components/Sidebar.svelte`](frontend/src/lib/components/Sidebar.svelte)** - Folder tree, tags list, navigation
- **[`src/lib/components/Editor.svelte`](frontend/src/lib/components/Editor.svelte)** - Note editing interface

#### Content Display
- **[`src/lib/components/NoteCard.svelte`](frontend/src/lib/components/NoteCard.svelte)** - Note preview card (masonry/list modes)
- **[`src/lib/components/views/ViewChat.svelte`](frontend/src/lib/components/views/ViewChat.svelte)** - Chat-style note view
- **[`src/lib/components/views/ViewList.svelte`](frontend/src/lib/components/views/ViewList.svelte)** - List view for notes
- **[`src/lib/components/views/ViewMasonry.svelte`](frontend/src/lib/components/views/ViewMasonry.svelte)** - Masonry grid view for notes
- **[`src/lib/components/MediaViewer.svelte`](frontend/src/lib/components/MediaViewer.svelte)** - Full-screen media viewer
- **[`src/lib/components/AttachmentPreview.svelte`](frontend/src/lib/components/AttachmentPreview.svelte)** - File attachment previews

#### Modals and Dialogs
- **[`src/lib/components/Auth.svelte`](frontend/src/lib/components/Auth.svelte)** - Login/register modal
- **[`src/lib/components/Settings.svelte`](frontend/src/lib/components/Settings.svelte)** - Settings panel (theme, subscription, account)
- **[`src/lib/components/Dialog.svelte`](frontend/src/lib/components/Dialog.svelte)** - Generic confirmation dialog
- **[`src/lib/components/ActionSheet.svelte`](frontend/src/lib/components/ActionSheet.svelte)** - Mobile-style action menu
- **[`src/lib/components/ContextMenu.svelte`](frontend/src/lib/components/ContextMenu.svelte)** - Desktop context menu
- **[`src/lib/components/PickerModal.svelte`](frontend/src/lib/components/PickerModal.svelte)** - Folder picker modal
- **[`src/lib/components/TagPicker.svelte`](frontend/src/lib/components/TagPicker.svelte)** - Tag selection modal
- **[`src/lib/components/Toast.svelte`](frontend/src/lib/components/Toast.svelte)** - Toast notifications
- **[`src/lib/components/QuickInput.svelte`](frontend/src/lib/components/QuickInput.svelte)** - Quick input component for fast actions

#### Interactive Components
- **[`src/lib/components/ChatBubble.svelte`](frontend/src/lib/components/ChatBubble.svelte)** - Individual chat message bubble

### Utilities
- **[`src/lib/utils.js`](frontend/src/lib/utils.js)** - Utility functions
- **[`src/lib/imageUtils.js`](frontend/src/lib/imageUtils.js)** - Image processing utilities
- **[`src/lib/actions.js`](frontend/src/lib/actions.js)** - Svelte actions
- **[`src/lib/osActions.js`](frontend/src/lib/osActions.js)** - OS-specific actions

### Routes
- **[`src/routes/+page.svelte`](frontend/src/routes/+page.svelte)** - Main app page (note list, editor, sidebar)
- **[`src/routes/+layout.svelte`](frontend/src/routes/+layout.svelte)** - Root layout
- **[`src/routes/+layout.js`](frontend/src/routes/+layout.js)** - Layout data loading
- **[`src/routes/settings/+page.svelte`](frontend/src/routes/settings/+page.svelte)** - Settings page

---

## Tauri (Desktop Application)

### Configuration
- **[`src-tauri/tauri.conf.json`](frontend/src-tauri/tauri.conf.json)** - Tauri application configuration (window settings, permissions, build)
- **[`src-tauri/Cargo.toml`](frontend/src-tauri/Cargo.toml)** - Rust dependencies and package metadata
- **[`src-tauri/capabilities/default.json`](frontend/src-tauri/capabilities/default.json)** - Security capabilities definition

### Source Code
- **[`src-tauri/src/main.rs`](frontend/src-tauri/src/main.rs)** - Entry point for Rust backend
- **[`src-tauri/src/lib.rs`](frontend/src-tauri/src/lib.rs)** - Library module for shared Rust logic

### Icons & Assets
- Icons for multiple platforms (Windows, macOS, Linux, Android, iOS) located in `src-tauri/icons/`

### Build Scripts
- **[`src-tauri/build.rs`](frontend/src-tauri/build.rs)** - Build-time script for Tauri

---

## Key Architectural Patterns

### Backend Flow
```
Client Request → API Handler → Store Facade → Repository → Database/S3
                     ↓
                Service Layer (optional business logic)
```

### Frontend Data Flow
```
User Action → Service (noteService, etc.) → dbService → IndexedDB
                        ↓
                  scheduleSync()
                        ↓
                  syncService → Encrypt → API → Backend
```

### Synchronization Flow
```
1. User creates/edits data → Service saves to IndexedDB (syncStatus='dirty')
2. Service calls syncService.scheduleSync() (debounced 2 seconds)
3. syncService collects dirty items, encrypts them
4. syncService pushes to /sync/push
5. Backend saves to PostgreSQL
6. Backend notifies other clients via SSE
7. Other clients receive SSE event → trigger forceSync()
8. syncService pulls from /sync/pull, decrypts, saves to IndexedDB
```

### Real-time Sync (SSE)
```
Client connects to /sync/events (long-lived HTTP connection)
  ↓
Backend broadcasts "sync_needed" when data changes
  ↓
Client receives SSE event → triggers forceSync()
```

---

## Critical Files for Maintenance

### When adding a new subscription tier:
1. Update [`backend/model/subscription.go`](backend/model/subscription.go) - Add tier constant and GetSubscriptionPlans()
2. Frontend will automatically pick up changes via API

### When modifying sync behavior:
1. Frontend: [`frontend/src/lib/services/syncService.js`](frontend/src/lib/services/syncService.js)
2. Backend: [`backend/api/sync.go`](backend/api/sync.go) and [`backend/store/data.go`](backend/store/data.go)

### When adding new data types:
1. Backend: Add DTO to [`backend/model/types.go`](backend/model/types.go)
2. Backend: Add to [`model.SyncPayload`](backend/model/types.go)
3. Backend: Handle in [`store/data.go`](backend/store/data.go) SaveSyncData/GetSyncData
4. Frontend: Add Dexie table in [`frontend/src/lib/db.js`](frontend/src/lib/db.js)
5. Frontend: Add service in [`frontend/src/lib/services/`](frontend/src/lib/services/)
6. Frontend: Add encryption in [`frontend/src/lib/services/syncService.js`](frontend/src/lib/services/syncService.js) CryptoService

---

## Common Tasks

### Adding a new API endpoint:
1. Create handler function in appropriate `backend/api/*.go` file
2. Register route in [`backend/main.go`](backend/main.go)
3. Add middleware if needed (auth, rate limit)

### Adding a new UI component:
1. Create component in [`frontend/src/lib/components/`](frontend/src/lib/components/)
2. Import and use in routes or other components

### Debugging sync issues:
1. Check browser console for `[Sync]` logs in [`syncService.js`](frontend/src/lib/services/syncService.js)
2. Check backend logs for sync errors
3. Verify syncStatus in IndexedDB (should be 'dirty' → 'synced')
4. Check SSE connection in Network tab (should be persistent)

---

## Best Practices

1. **Always call `syncService.scheduleSync()`** after modifying data in services
2. **Use [`config.js`](frontend/src/lib/config.js)** for all configuration values
3. **Keep business logic in services**, not in components
4. **Subscription plans** must only be defined in [`backend/model/subscription.go`](backend/model/subscription.go)
5. **Encrypt sensitive data** before sync using CryptoService in [`syncService.js`](frontend/src/lib/services/syncService.js)

---

## File Count Summary

- **Backend**: 14 files (main, api, model, store)
- **Frontend**: 40+ files (components, services, routes, utilities)
- **Tauri**: 10+ files (configuration, source, icons)
- **Total**: ~65 source files

---

## Recent Refactoring

### Fixed Issues:
1. ✅ SQL bug in tags INSERT (removed extra $6 placeholder)
2. ✅ Unified subscription tiers (single source in model/subscription.go)
3. ✅ Added sync triggers to noteService, tagService, folderService
4. ✅ Deleted redundant crypto files (cryptoHelper.js, optimizedCryptoService.js)
5. ✅ Created centralized config.js
6. ✅ Updated all files to use centralized config

### Code Removed:
- 2 redundant crypto files
- Conflicting subscription plans method
- ~800 lines of duplicate code identified (to be removed in next phase)

### Structural Changes:
- Consolidated repositories: `user_repository.go`, `sync_repository.go`, `file_repository.go`, `transaction_repository.go`, `subscription_repository.go`, `cleanup_repository.go` merged into `store/user.go` and `store/data.go`
- Removed `services/` directory; business logic integrated into repositories
- Frontend: removed `sync/` directory; functionality moved to `services/syncService.js`
- Frontend: removed `stores/` directory; UI state moved to `services/uiStore.js`
- Added Tauri desktop application support
