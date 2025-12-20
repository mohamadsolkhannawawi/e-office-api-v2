// programstudi.service.ts

import { Prisma, type ProgramStudi } from "@backend/db/index.ts";
import type {
	ProgramStudiCreateArgs,
	ProgramStudiCreateInput,
	ProgramStudiDelegate,
	ProgramStudiInclude,
	ProgramStudiUpdateInput,
} from "@backend/generated/prisma/models.ts";
import { CRUD } from "./__basicCRUD.ts";

export abstract class ProgramStudiService extends CRUD<
	ProgramStudi,
	ProgramStudiDelegate,
	ProgramStudiInclude
>(Prisma.programStudi) {
	public static create(data: ProgramStudiCreateInput) {
		return Prisma.programStudi.create({ data: data });
	}

	public static update(id: string, data: ProgramStudiUpdateInput) {
		return Prisma.programStudi.update({
			where: { id: id },
			data: data,
		});
	}
}
