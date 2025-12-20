import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia } from "elysia";

export default new Elysia().use(authGuardPlugin).get(
	"/",
	async ({ user }) => {
		console.log(user);
		return user;
	},
	{},
);
