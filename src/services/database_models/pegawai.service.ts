// pegawai.service.ts

import { Prisma, type Pegawai } from "@backend/db/index.ts";
import type {
	PegawaiDelegate,
	PegawaiInclude,
} from "@backend/generated/prisma/models.ts";
import { CRUD } from "./__basicCRUD.ts";

export abstract class PegawaiService extends CRUD<
	Pegawai,
	PegawaiDelegate,
	PegawaiInclude
>(Prisma.pegawai) {}
