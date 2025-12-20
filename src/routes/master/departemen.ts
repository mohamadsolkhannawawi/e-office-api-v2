import { authGuardPlugin, requirePermission } from "@backend/middlewares/auth.ts";
import { DepartemenService } from "@backend/services/database_models/departemen.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
	.use(authGuardPlugin)
	.get(
		"/all",
		async () => {
			DepartemenService.getAll();
			return;
		},
		{
			...requirePermission("departemen", "read"),
			body: t.Object({}),
		},
	)
	.get(
		"/:id",
		async ({ params: { id } }) => {
			return DepartemenService.get(id);
		},
		{
			...requirePermission("departemen", "read"),
			body: t.Object({}),
		},
	)
	.post(
		"/",
		async ({ body: { name, code } }) => {
			const letter = await DepartemenService.create({
				name: name,
				code: code,
			});

			return {
				message: "Departemen created successfully",
				letter,
			};
		},
		{
			...requirePermission("departemen", "create"),
			body: t.Object({
				name: t.String(),
				code: t.String(),
			}),
		},
	)
	.patch(
		"/",
		async ({ body: { id, name, code } }) => {
			const letter = await DepartemenService.update(id, {
				name: name,
				code: code,
			});

			return {
				message: "Departemen update successfully",
				letter,
			};
		},
		{
			...requirePermission("departemen", "write"),
			body: t.Object({
				id: t.String(),
				name: t.String(),
				code: t.String(),
			}),
		},
	);
