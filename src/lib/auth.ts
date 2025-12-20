// dont use any @ import for this file, better auth is picky
import { PrismaClient } from "@backend/db/index.ts";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous, bearer, jwt } from "better-auth/plugins";

const prisma = new PrismaClient();
export const auth = betterAuth({
	// database: prismaAdapter(Prisma, {
	// 	provider: "postgresql",
	// }),
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	experimental: {
		joins: true,
	},
	emailAndPassword: {
		enabled: true,
	},
	basePath: "/api/auth",
	plugins: [
		anonymous(),
		bearer(),
		// jwt()
	],
});
