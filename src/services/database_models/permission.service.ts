// permission.service.ts

import { Prisma, type Permission } from "@backend/db/index.ts";
import type {
	PermissionDelegate,
	PermissionInclude,
} from "@backend/generated/prisma/models.ts";
import { CRUD } from "./__basicCRUD.ts";

export abstract class PermissionService extends CRUD<
	Permission,
	PermissionDelegate,
	PermissionInclude
>(Prisma.permission) {}
