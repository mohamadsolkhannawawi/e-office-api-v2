import { authGuardPlugin, requirePermission } from "@backend/middlewares/auth.ts";
import { Elysia, t } from "elysia";
import { LetterTemplateService } from "@backend/services/database_models/letterTemplate.service.ts";

export default new Elysia()
	.use(authGuardPlugin)
	.get(
		"/all",
		async () => {
			LetterTemplateService.getAll();
			return;
		},
		{
			...requirePermission("letterTemplate", "read"),
			body: t.Object({}),
		},
	)
	.get(
		"/:id",
		async ({ params: { id } }) => {
			return LetterTemplateService.get(id);
		},
		{
			...requirePermission("letterTemplate", "read"),
			body: t.Object({}),
		},
	)
	.post(
		"/",
		async ({
			body: { schemaDefinition, formFields, letterTypeId, versionName },
		}) => {
			const letter = await LetterTemplateService.create({
				schemaDefinition,
				formFields,
				letterTypeId,
				versionName,
			});

			return {
				message: "Letter Template created successfully",
				letter,
			};
		},
		{
			...requirePermission("letterTemplate", "create"),
			body: t.Object({
				schemaDefinition: t.String(),
				formFields: t.String(),
				letterTypeId: t.String(),
				versionName: t.String(),
			}),
		},
	);
// no update for template, create new
