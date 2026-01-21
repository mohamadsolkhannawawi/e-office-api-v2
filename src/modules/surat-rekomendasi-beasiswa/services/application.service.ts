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
        status?: string | string[];
        currentStep?: number;
        letterTypeId: string;
        page?: number;
        limit?: number;
        createdById?: string;
        currentRoleId?: string;
        jenisBeasiswa?: string;
        search?: string;
        excludeStatus?: string[];
        startDate?: string;
        endDate?: string;
        sortOrder?: "asc" | "desc";
        processedByStep?: number; // For "selesai" pages - show apps processed by this step
    }) {
        const { page = 1, limit = 20, search, sortOrder = "desc" } = filters;
        const skip = (page - 1) * limit;

        const andConditions: any[] = [{ letterTypeId: filters.letterTypeId }];

        if (filters.status) {
            if (Array.isArray(filters.status)) {
                andConditions.push({ status: { in: filters.status } });
            } else {
                andConditions.push({ status: filters.status });
            }
        }

        if (filters.excludeStatus) {
            andConditions.push({ status: { notIn: filters.excludeStatus } });
        }

        if (filters.currentStep !== undefined) {
            andConditions.push({ currentStep: filters.currentStep });
        }

        if (filters.createdById) {
            andConditions.push({ createdById: filters.createdById });
        }

        if (filters.currentRoleId) {
            andConditions.push({ currentRoleId: filters.currentRoleId });
        }

        // Filter for "selesai" pages - applications that have been processed by this step
        // Either currentStep > processedByStep (moved forward) OR status is terminal (COMPLETED/REJECTED)
        if (filters.processedByStep !== undefined) {
            andConditions.push({
                OR: [
                    { currentStep: { gt: filters.processedByStep } },
                    { status: { in: ["COMPLETED", "REJECTED"] } },
                ],
            });
        }

        if (filters.jenisBeasiswa && filters.jenisBeasiswa !== "ALL") {
            andConditions.push({
                values: {
                    path: ["jenisBeasiswa"],
                    equals: filters.jenisBeasiswa,
                },
            });
        }

        if (filters.startDate || filters.endDate) {
            const dateFilter: any = {};
            if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
            if (filters.endDate) dateFilter.lte = new Date(filters.endDate);
            andConditions.push({ createdAt: dateFilter });
        }

        if (search && search.trim() !== "") {
            const searchLower = search.trim();
            andConditions.push({
                OR: [
                    {
                        scholarshipName: {
                            contains: searchLower,
                            mode: "insensitive",
                        },
                    },
                    {
                        createdBy: {
                            name: {
                                contains: searchLower,
                                mode: "insensitive",
                            },
                        },
                    },
                    {
                        createdBy: {
                            mahasiswa: {
                                nim: {
                                    contains: searchLower,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        values: {
                            path: ["namaBeasiswa"],
                            string_contains: searchLower,
                        },
                    },
                    {
                        values: {
                            path: ["namaLengkap"],
                            string_contains: searchLower,
                        },
                    },
                ],
            });
        }

        const where = { AND: andConditions };

        console.log(
            "Listing applications with where:",
            JSON.stringify(where, null, 2),
        );

        const [items, total] = await Promise.all([
            db.letterInstance.findMany({
                where,
                orderBy: { createdAt: sortOrder },
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
                history: {
                    orderBy: { createdAt: "desc" },
                    include: {
                        actor: true,
                    },
                },
                verification: true,
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

    static async getStats(letterTypeId: string, filters: any = {}) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLast30Days = new Date();
        startOfLast30Days.setDate(now.getDate() - 30);

        // Build base where clause similar to listApplications
        const baseWhere: any = { letterTypeId, status: { not: "DRAFT" } };

        if (filters.createdById) {
            baseWhere.createdById = filters.createdById;
        }

        const [
            total,
            pending,
            inProgress,
            completed,
            rejected,
            totalCreatedThisMonth,
            totalCompletedThisMonth,
            trendData,
        ] = await Promise.all([
            // Overall counts
            db.letterInstance.count({
                where: { ...baseWhere },
            }),
            db.letterInstance.count({
                where: { ...baseWhere, status: "PENDING" },
            }),
            db.letterInstance.count({
                where: { ...baseWhere, status: "IN_PROGRESS" },
            }),
            db.letterInstance.count({
                where: { ...baseWhere, status: "COMPLETED" },
            }),
            db.letterInstance.count({
                where: { ...baseWhere, status: "REJECTED" },
            }),
            // Monthly stats
            db.letterInstance.count({
                where: {
                    ...baseWhere,
                    createdAt: { gte: startOfMonth },
                },
            }),
            db.letterInstance.count({
                where: {
                    ...baseWhere,
                    status: "COMPLETED",
                    updatedAt: { gte: startOfMonth },
                },
            }),
            // Trend data
            db.letterInstance.findMany({
                where: {
                    ...baseWhere,
                    createdAt: { gte: startOfLast30Days },
                },
                select: { createdAt: true },
            }),
        ]);

        // Process trend data
        const trendMap = new Map<string, number>();
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(now.getDate() - i);
            trendMap.set(date.toISOString().split("T")[0] || "", 0);
        }

        trendData.forEach((item) => {
            const dateStr = item.createdAt.toISOString().split("T")[0] || "";
            if (dateStr && trendMap.has(dateStr)) {
                trendMap.set(dateStr, (trendMap.get(dateStr) || 0) + 1);
            }
        });

        const trend = Array.from(trendMap.entries())
            .map(([date, count]) => ({ date, count }))
            .reverse();

        return {
            total,
            pending,
            inProgress,
            completed,
            rejected,
            totalCreatedThisMonth,
            totalCompletedThisMonth,
            trend,
            distribution: {
                pending,
                inProgress,
                completed,
                rejected,
            },
        };
    }
}
