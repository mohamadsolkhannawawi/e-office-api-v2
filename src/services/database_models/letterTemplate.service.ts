import { type LetterTemplate, Prisma } from "@backend/db/index.ts";
import { CRUD } from "./__basicCRUD.ts";
import type {
	LetterTemplateCreateInput,
	LetterTemplateCreateManyInput,
	LetterTemplateDelegate,
	LetterTemplateInclude,
	LetterTemplateUncheckedCreateInput,
	LetterTemplateUpdateArgs,
	LetterTemplateUpdateInput,
} from "@backend/generated/prisma/models.ts";
import { z } from "zod";
import { LetterTypeService } from "./letterType.service.ts";

const LetterOverlayPositionV1 = z.object({
	x: z.number(),
	y: z.number(),
});

const LetterOverlayScaleV1 = z.object({
	x: z.number(),
	y: z.number(),
});

const LetterOverlayTransformV1 = z.object({
	position: LetterOverlayPositionV1,
	scale: LetterOverlayScaleV1,
	rotation: z.number(),
});

const LetterFieldStringV1 = z.object({
	data_type: z.literal("string"),
	label: z.string(),
	value: z.string(),
	transform: LetterOverlayTransformV1,
});

const LetterFieldAttachmentV1 = z.object({
	data_type: z.literal("attachment"),
	label: z.string(),
	value: z.string(),
	transform: LetterOverlayTransformV1,
});

const FieldSchema = z.discriminatedUnion("data_type", [
	LetterFieldStringV1,
	LetterFieldAttachmentV1,
]);

const LetterSchemaV1 = z.object({
	version: z.string(),
	data: z.array(FieldSchema),
});

export abstract class LetterTemplateService extends CRUD<
	LetterTemplate,
	LetterTemplateDelegate,
	LetterTemplateInclude
>(Prisma.letterTemplate) {
	// biome-ignore lint/suspicious/noExplicitAny: this is for validation purpose, so this is intended
	public static async validateSchemaV1(_schema: any) {
		const safe = LetterSchemaV1.parse(_schema);

		return safe;
	}

	public static async create(data: LetterTemplateUncheckedCreateInput) {
		// validate, name must unique within the letter type directive
		const letterTypes = await LetterTemplateService.getMany({
			where: {
				letterTypeId: data.letterTypeId,
				name: data.versionName,
			},
		});

		if (letterTypes) {
			throw Error("Duplicate Version Name, Choose Another");
		}

		// schema must match schema version used
		const schema = LetterTemplateService.validateSchemaV1(
			data.schemaDefinition,
		);

		const letterTemplate = Prisma.letterTemplate.create({
			data: data,
		});

		return letterTemplate;
	}

	public static async update(id: string, data: LetterTemplateUpdateInput) {
		// schema must match schema version used
		const schema = LetterTemplateService.validateSchemaV1(
			data.schemaDefinition,
		);

		const updatedLetterTemplate = Prisma.letterTemplate.update({
			where: {
				id: id,
			},
			data: data,
		});

		return updatedLetterTemplate;
	}
}
