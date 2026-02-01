# E-Office API Surat Rekomendasi Beasiswa - Backend

Backend API untuk Sistem E-Office yang dibangun dengan **Elysia.js**, **Prisma ORM**, dan **Bun Runtime**, menyediakan layanan untuk manajemen surat rekomendasi beasiswa, autentikasi role-based, dan manajemen file menggunakan MinIO.

## 📋 Daftar Isi

- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Struktur Project](#struktur-project)
- [Fitur Utama](#fitur-utama)
- [Troubleshooting](#troubleshooting)

## 🛠️ Prasyarat

Pastikan komputer Anda memiliki tools berikut dengan versi minimal yang ditentukan:

### 1. Bun Runtime

```bash
bun --version
```

**Versi yang diperlukan: Bun 1.0 atau lebih tinggi**

Download dari: https://bun.sh

### 2. PostgreSQL

```bash
psql --version
```

**Versi yang diperlukan: PostgreSQL 14 atau lebih tinggi**

### 3. Docker & Docker Compose

Sangat direkomendasikan untuk menjalankan layanan pendukung (PostgreSQL, MinIO) agar environment tetap konsisten.

```bash
docker --version
docker-compose --version # Atau 'docker compose version'
```

**Versi yang diperlukan: Docker Desktop atau Docker Engine + Docker Compose v2**

**Versi yang diperlukan: Docker Desktop atau Docker Engine + Docker Compose v2**

Download dari: https://www.docker.com/products/docker-desktop/

### 4. LibreOffice (Optional but Recommended)

Diperlukan untuk fitur **Konversi DOCX ke PDF**. Jika tidak diinstall, API convert PDF akan mengembalikan error 503, namun fitur lain tetap berjalan.

**Windows:**

```powershell
winget install TheDocumentFoundation.LibreOffice
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install libreoffice
```

## 📥 Instalasi

### Step 1: Clone Repository

```bash
git clone https://your-repository-url/e-office-api-v2.git
cd e-office-api-v2
```

### Step 2: Install Dependencies

```bash
bun install
```

### Step 3: Setup Environment File

Buat file `.env` di root folder dan sesuaikan konfigurasi (lihat bagian [Konfigurasi](#konfigurasi)).

## ⚙️ Konfigurasi

### 1. Environment Variables

Buat file `.env` dan atur parameter berikut:

```env
# Server
PORT=3005
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL="postgresql://postgres:12345678@localhost:5432/persuratan-mahasiswa-terbaru?schema=public"

# MinIO (File Storage)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=documents

# JWT & Security
JWT_SECRET=your_super_secret_key_change_me
ALLOWED_ORIGINS=http://localhost:3000
```

### 2. Database Migration

Jalankan migrasi Prisma untuk membuat skema database:

```bash
bun db:push
# Atau untuk migration file
bun db:migrate
```

### 3. MinIO Setup

Pastikan bucket yang didefinisikan di `MINIO_BUCKET_NAME` sudah dibuat di console MinIO.

## 🚀 Menjalankan Aplikasi

### Menyiapkan Layanan Pendukung (Docker)

Aplikasi ini memerlukan PostgreSQL dan MinIO. Jalankan perintah berikut untuk menjalankan keduanya menggunakan Docker:

```bash
# Menjalankan database dan minio di background
docker compose -f docker-compose.dev.yml up -d
```

Setelah container berjalan, pastikan Anda melakukan [Database Migration](#2-database-migration).

### Mode Development

Untuk menjalankan aplikasi dengan hot-reloading:

```bash
bun run dev
```

Server berjalan di: `http://localhost:3005` (atau port yang didefinisikan).

### Mode Production

```bash
bun run start
```

### Type Checking & Linting

```bash
bun run lint
```

## 📁 Struktur Project

```
e-office-api-v2/
├── src/
│   ├── db/                     # Prisma Client & Connection
│   ├── middlewares/            # Auth, Permission, & Validation Middlewares
│   ├── modules/                # Specialized Domain Modules
│   │   └── surat-rekomendasi-beasiswa/
│   │       ├── controllers/
│   │       ├── services/
│   │       └── routes.ts
│   ├── routes/                 # API Routes (Master & Public)
│   │   ├── master/             # Domain Resource Routes
│   │   └── public/             # Authentication & Public endpoints
│   ├── services/               # Core Services & CRUD Models
│   │   └── database_models/    # Basic CRUD for Prisma models
│   ├── shared/                 # Shared Utilities & Services
│   │   └── services/           # e.g., MinioService
│   ├── index.ts                # App Entry Point
│   └── server.ts               # Elysia Server Config
├── prisma/
│   ├── schema.prisma           # Database Schema
│   └── migrations/             # SQL Migrations
├── docker-compose.yml          # Production Setup
├── docker-compose.dev.yml      # Development Setup (DB & MinIO)
└── package.json
```

## ✨ Fitur Utama

### Modular Architecture

Menggunakan pendekatan modular di mana setiap fitur besar (seperti Surat Rekomendasi) memiliki foldernya sendiri yang berisi controller, service, dan routes yang relevan.

### High Performance

Dibangun di atas **Elysia.js** dan **Bun**, memberikan performa yang sangat tinggi dan latency rendah.

### Role-Based Authorization

Menggunakan middleware autentikasi yang mendukung pengecekan permission granular untuk role seperti Mahasiswa, Supervisor, Wadek, dll.

### Integrated File Management

Service MinIO terintegrasi untuk menangani upload, validasi tipe file, dan manajemen path penyimpanan yang terstruktur.

## 🐛 Troubleshooting

### Error: "Prisma Client not initialized"

Pastikan Anda sudah menjalankan generate:

```bash
bunx prisma generate
```

### Error: "Connection refused (MinIO)"

Pastikan container MinIO berjalan (`docker ps`) dan port-nya sesuai dengan konfigurasi `.env`.

### Error: "Docker command not found"

Pastikan Docker Desktop sudah terinstal dan sedang berjalan. Jika Anda menggunakan WSL2 di Windows, pastikan integrasi WSL sudah diaktifkan di pengaturan Docker Desktop.

### Port Conflict

Jika port 3000 terpakai, ubah `PORT` di `.env` atau jalankan pada port lain.

## 🤝 Kolaborasi

1. **Format Commit:** Selalu gunakan format conventional commit (`feat:`, `fix:`, `chore:`).
2. **Type Safety:** Pastikan tidak ada error TypeScript (`bun lint`) sebelum push.
3. **Migration:** Jika mengubah `schema.prisma`, jangan lupa commit file migrasi-nya.

---

**Powered by Bun & Elysia 🦊**
