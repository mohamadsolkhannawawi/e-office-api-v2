import { authGuardPlugin, requirePermission } from "@backend/middlewares/auth.ts";
import { UserService } from "@backend/services/database_models/user.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
	.use(authGuardPlugin)
	.get(
		"/all",
		async () => {
			return UserService.getAll();
		},
		{
			...requirePermission("user", "read"),
			body: t.Object({}),
		},
	)
	.get(
		"/:id",
		async ({ params: { id } }) => {
			return UserService.get(id);
		},
		{
			...requirePermission("user", "read"),
			body: t.Object({}),
		},
	)
	.post(
		"/",
		async ({ body: { name, email } }) => {
			const letter = await UserService.create({
				name: name,
				email: email,
				isAnonymous: false,
			});

			return {
				message: "User created successfully",
				letter,
			};
		},
		{
			...requirePermission("user", "create"),
			body: t.Object({
				name: t.String(),
				email: t.String(),
			}),
		},
	)
	.patch(
		"/",
		async ({ body: { id, name } }) => {
			const letter = await UserService.update(id, {
				name: name,
			});

			return {
				message: "User update successfully",
				letter,
			};
		},
		{
			...requirePermission("user", "write"),
			body: t.Object({
				id: t.String(),
				name: t.Optional(t.String()),
			}),
		},
	);
