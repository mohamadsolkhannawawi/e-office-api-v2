import { Prisma } from "../../../db/index.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";

const db = Prisma;

export class ApplicationService {
    static async createApplication(data: {
        namaBeasiswa: string;
        values: any;
        userId: string;
        letterTypeId: string;
        status?: string;
    }) {
        return await db.letterInstance.create({
            data: {
                scholarshipName: data.namaBeasiswa,
                values: data.values || {},
                status: (data.status as any) || "PENDING",
                currentStep: 1,
                letterTypeId: data.letterTypeId,
                createdById: data.userId,
                schema: {},
            },
        });
    }

    static async updateApplicationData(
        id: string,
        data: {
            namaBeasiswa?: string;
            values?: any;
            status?: string;
        },
    ) {
        return await db.letterInstance.update({
            where: { id },
            data: {
                ...(data.namaBeasiswa
                    ? { scholarshipName: data.namaBeasiswa }
                    : {}),
                ...(data.values ? { values: data.values } : {}),
                ...(data.status ? { status: data.status as any } : {}),
            },
        });
    }

    static async listApplications(filters: {
        status?: string;
        currentStep?: number;
        letterTypeId: string;
        page?: number;
        limit?: number;
        createdById?: string;
        currentRoleId?: string;
    }) {
        const { page = 1, limit = 20 } = filters;
        const skip = (page - 1) * limit;

        const where: any = {
            letterTypeId: filters.letterTypeId,
            ...(filters.status ? { status: filters.status as any } : {}),
            ...(filters.currentStep !== undefined
                ? { currentStep: filters.currentStep }
                : {}),
            ...(filters.createdById
                ? { createdById: filters.createdById }
                : {}),
            ...(filters.currentRoleId
                ? { currentRoleId: filters.currentRoleId }
                : {}),
        };

        const [items, total] = await Promise.all([
            db.letterInstance.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                include: {
                    attachments: {
                        where: { deletedAt: null },
                    },
                    createdBy: {
                        include: {
                            mahasiswa: {
                                include: {
                                    departemen: true,
                                    programStudi: true,
                                },
                            },
                        },
                    },
                },
            }),
            db.letterInstance.count({ where }),
        ]);

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    static async getApplicationById(id: string) {
        return await db.letterInstance.findUnique({
            where: { id },
            include: {
                attachments: {
                    where: { deletedAt: null },
                },
                createdBy: {
                    include: {
                        mahasiswa: {
                            include: {
                                departemen: true,
                                programStudi: true,
                            },
                        },
                    },
                },
            },
        });
    }

    static async updateApplicationStatus(
        id: string,
        data: {
            status: string;
            currentStep?: number;
            currentRoleId?: string | null;
            values?: any;
            letterNumber?: string;
            publishedAt?: Date;
        },
        history: {
            actorId: string;
            action: string;
            note?: string;
        },
    ) {
        return await db.$transaction(async (tx) => {
            // 1. Update Instance
            const updated = await tx.letterInstance.update({
                where: { id },
                data: {
                    status: data.status as any,
                    ...(data.currentStep !== undefined
                        ? { currentStep: data.currentStep }
                        : {}),
                    ...(data.currentRoleId !== undefined
                        ? { currentRoleId: data.currentRoleId }
                        : {}),
                    ...(data.values ? { values: data.values } : {}),
                    ...(data.letterNumber
                        ? { letterNumber: data.letterNumber }
                        : {}),
                    ...(data.publishedAt
                        ? { publishedAt: data.publishedAt }
                        : {}),
                },
            });

            // 2. Create History Log
            await tx.letterHistory.create({
                data: {
                    letterInstanceId: id,
                    actorId: history.actorId,
                    action: history.action,
                    note: history.note,
                    status: data.status,
                },
            });

            return updated;
        });
    }

    static async getStats(letterTypeId: string) {
        const [total, pending, inProgress, completed, rejected, byDepartment] =
            await Promise.all([
                db.letterInstance.count({ where: { letterTypeId } }),
                db.letterInstance.count({
                    where: { letterTypeId, status: "PENDING" },
                }),
                db.letterInstance.count({
                    where: { letterTypeId, status: "IN_PROGRESS" },
                }),
                db.letterInstance.count({
                    where: { letterTypeId, status: "COMPLETED" },
                }),
                db.letterInstance.count({
                    where: { letterTypeId, status: "REJECTED" },
                }),
                db.letterInstance.groupBy({
                    by: ["createdById"],
                    where: { letterTypeId },
                    _count: true,
                }),
            ]);

        return {
            total,
            pending,
            inProgress,
            completed,
            rejected,
            departmentCount: byDepartment.length,
        };
    }
}
