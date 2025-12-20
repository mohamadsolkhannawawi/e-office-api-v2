import { Prisma, type Role } from "@backend/db/index.ts";
import type { RoleDelegate, RoleInclude } from "@backend/generated/prisma/models.ts";
import { CRUD } from "./__basicCRUD.ts";

export abstract class RoleService extends CRUD<Role, RoleDelegate, RoleInclude>(
	Prisma.role,
) {}
