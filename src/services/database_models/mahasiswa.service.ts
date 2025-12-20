// mahasiswa.service.ts

import { Prisma, type Mahasiswa } from "@backend/db/index.ts";
import type {
	MahasiswaDelegate,
	MahasiswaInclude,
	MahasiswaUncheckedCreateInput,
	MahasiswaUncheckedUpdateInput,
} from "@backend/generated/prisma/models.ts";
import { CRUD } from "./__basicCRUD.ts";

export abstract class MahasiswaService extends CRUD<
	Mahasiswa,
	MahasiswaDelegate,
	MahasiswaInclude
>(Prisma.mahasiswa) {
	public static create(data: MahasiswaUncheckedCreateInput) {
		return Prisma.mahasiswa.create({
			data: data,
		});
	}

	public static update(id: string, data: MahasiswaUncheckedUpdateInput) {
		return Prisma.mahasiswa.update({
			where: { id: id },
			data: data,
		});
	}
}
