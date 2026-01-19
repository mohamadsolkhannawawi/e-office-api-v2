import { Prisma } from "../../../db/index.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";

const db = Prisma;

export class ApplicationService {
    static async createApplication(data: {
        namaBeasiswa: string;
        values: any;
        userId: string;
        letterTypeId: string;
    }) {
        return await db.letterInstance.create({
            data: {
                scholarshipName: data.namaBeasiswa,
                values: data.values || {},
                status: "PENDING",
                currentStep: 1,
                letterTypeId: data.letterTypeId,
                createdById: data.userId,
                schema: {},
            },
        });
    }

    static async listApplications(filters: {
        status?: string;
        currentStep?: number;
        letterTypeId: string;
        page?: number;
        limit?: number;
    }) {
        const { page = 1, limit = 20 } = filters;
        const skip = (page - 1) * limit;

        const where: any = {
            letterTypeId: filters.letterTypeId,
            ...(filters.status ? { status: filters.status as any } : {}),
            ...(filters.currentStep !== undefined
                ? { currentStep: filters.currentStep }
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
        data: { status: string; currentStep?: number },
    ) {
        return await db.letterInstance.update({
            where: { id },
            data: {
                status: data.status as any,
                ...(data.currentStep !== undefined
                    ? { currentStep: data.currentStep }
                    : {}),
            },
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
