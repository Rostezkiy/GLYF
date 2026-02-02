# GLYF

A high-performance, offline-first, cross-platform note-taking ecosystem featuring End-to-End Encryption (E2EE), real-time synchronization, and a versatile multi-view interface.

**Status:** `MVP / Work-in-Progress`. This project is functional and used in a live environment, but it is not yet a "one-click" deployment. Manual configuration of environment variables and infrastructure is required.

---

## 🏗 Architecture Overview

GLYF is built with a decoupled architecture designed for speed and security:

-   **Backend:** A stateless Go microservice handling authentication, metadata synchronization, and S3 file orchestration.
-   **Frontend:** A Svelte-based SPA (Single Page Application) utilizing IndexedDB for offline-first capabilities and a custom sync engine.
-   **Desktop:** Native desktop integration via Tauri (Rust), sharing the Svelte core logic.
-   **Mobile:** Experimental support for Android via Capacitor.
-   **Security:** E2E Encryption ensures that the server never sees the plain-text content of notes.

---

## 🛠 Tech Stack

-   **Language:** Go 1.21+ (Backend), JavaScript/Svelte (Frontend), Rust (Tauri).
-   **Database:** PostgreSQL 15+.
-   **Storage:** S3-Compatible Storage (e.g., Beget Cloud, AWS S3, MinIO).
-   **Real-time:** Server-Sent Events (SSE) for instant sync triggers.
-   **Deployment:** Docker / Docker Compose (Containerized Backend).

---

## 📁 Project Structure

```text
.
├── backend/
│   ├── api/            # HTTP Handlers & SSE Broker
│   ├── model/          # Data structures & Subscription logic
│   ├── store/          # Database (Postgres) & Storage (S3) logic
│   ├── main.go         # Application entry point
│   └── docker-compose.yml
├── frontend/
│   ├── src/            # Svelte source code
│   ├── src-tauri/      # Rust/Tauri desktop configuration
│   ├── android/        # Capacitor Android project
│   └── static/         # Assets
└── shared/             # Shared constants/types (if applicable)
```

---

## 🚀 Getting Started

Currently, deployment requires manual setup of the environment. A full "one-click" Dockerized stack is planned for future releases.

### 1. Prerequisites
- Docker & Docker Compose
- Go 1.21+ (for local development)
- Node.js & NPM
- An S3-compatible bucket

### 2. Backend Configuration
The backend expects specific environment variables. Create a `.env` file in the `backend/` directory:

```env
DB_USER=your_user
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
S3_ACCESS_KEY=your_key
S3_SECRET_KEY=your_secret
S3_BUCKET=your_bucket_name
```

Run the backend infrastructure:
```bash
cd backend
docker-compose up -d --build
```
*Note: The `api` service in docker-compose is configured to bind to `127.0.0.1:8081` by default.*

### 3. Frontend Configuration
Currently, API endpoints are defined in `frontend/src/lib/config.js`. 
1. Open the file and update the `API_BASE_URL` to point to your backend.
2. Install dependencies and run in dev mode:
```bash
cd frontend
npm install
npm run dev
```

### 4. Desktop App (Tauri)
To run the desktop version:
```bash
cd frontend
npm run tauri dev
```

You can also create Android/iOS package using [Capacitor](https://capacitorjs.com/)

---

## 🔒 Security Implementation

Glyf utilizes a non-custodial security model:
1. **Key Derivation:** User keys are derived client-side from the master password.
2. **Encryption:** Notes are encrypted using AES-GCM before being transmitted to the backend.
3. **Transmission:** Data is sent over HTTPS, but remains unreadable to the server even if intercepted.

---

## 🗺 Roadmap

- [ ] **Full Containerization:** Adding Nginx and Frontend to `docker-compose.yml`.
- [ ] **Automated Migration:** Transitioning from `init.sql` to a structured migration tool.
- [ ] **Enhanced Mobile Support:** Finalizing the Capacitor build pipeline for iOS/Android.
- [ ] **Public API:** Allowing third-party integrations with the sync engine.

---

## ⚠️ Disclaimer

This is an **MVP**. While the core synchronization and encryption logic are stable, you may encounter edge cases. Use in production at your own risk. Contributions and bug reports are welcome via Pull Requests.

---

*Developed by R057*
