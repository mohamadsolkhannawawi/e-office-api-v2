/**
 * Prisma Database Client - Inisialisasi Database Connection
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * File ini mengelola inisialisasi Prisma Client dengan singleton pattern untuk
 * mencegah multiple database connections di development environment.
 *
 * Fitur Utama:
 * - Singleton pattern untuk reuse instance di development
 * - Logging untuk query, info, warn, dan error
 * - Global caching untuk mencegah connection leaks
 * - Automatic connection management
 *
 * Penggunaan:
 * import { Prisma } from '@/db';
 * const users = await Prisma.user.findMany();
 */

// [IMPORT] Import PrismaClient dari generated Prisma schema
import { PrismaClient } from "@backend/generated/prisma/client.ts";

// [SINGLETON] Global type untuk menyimpan Prisma instance
// Prevents creating multiple PrismaClient instances di development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// [CLIENT] Prisma Client Instance - Singleton Pattern
// Menggunakan nullish coalescing operator (??) untuk reuse instance
// - Jika sudah ada instance di global, gunakan itu
// - Jika belum ada, buat instance baru dengan konfigurasi logging
export const Prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

// [DEVELOPMENT] Caching Prisma instance untuk development environment
// Hanya di-set jika NODE_ENV !== "production" untuk mencegah multiple instances
// di development hot-reload scenarios
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = Prisma;
}

// [EXPORT] Re-export semua types dan interfaces dari generated Prisma client
// Includes: Prisma, PrismaClient, dan semua model types
export * from "@backend/generated/prisma/client.ts";
