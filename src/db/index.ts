import { PrismaClient } from "@backend/generated/prisma/client.ts";

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const Prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: ["query", "info", "warn", "error"],
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = Prisma;
}

export * from "@backend/generated/prisma/client.ts";
