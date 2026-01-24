import { Prisma } from "../../../db/index.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";

const db = Prisma;

/**
 * Helper: Check if a letter has been processed by a specific role
 * Returns true if role has any action (approve/reject/revision) on this letter
 */
async function hasLetterBeenProcessedByRole(
    letterInstanceId: string,
    roleId: string | null,
): Promise<boolean> {
    if (!roleId) return false;

    const history = await db.letterHistory.findFirst({
        where: {
            letterInstanceId,
            roleId,
        },
    });
    return !!history;
}

/**
 * Helper: Get the latest status for a letter from a specific role
 * Useful to determine if it was rejected/revised by that role
 */
async function getLatestRoleActionStatus(
    letterInstanceId: string,
    roleId: string | null,
): Promise<string | null> {
    if (!roleId) return null;

    const history = await db.letterHistory.findFirst({
        where: {
            letterInstanceId,
            roleId,
        },
        orderBy: { createdAt: "desc" },
    });
    return history?.status || null;
}

export class ApplicationService {
    static async createApplication(data: {
        namaBeasiswa: string;
        values: any;
        userId: string;
        letterTypeId: string;
        status?: string;
    }) {
        // Create letter instance and initial history entry in a transaction
        return await db.$transaction(async (tx) => {
            const created = await tx.letterInstance.create({
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

            // Record initial submission in letterHistory so inbox filtering works
            await tx.letterHistory.create({
                data: {
                    letterInstanceId: created.id,
                    actorId: data.userId,
                    action: "submit",
                    note: "Initial submission",
                    status: created.status,
                },
            });

            return created;
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
        roleFilterMode?: "processed" | "pending" | "relevant" | "all"; // New filter mode
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

        if (filters.createdById) {
            andConditions.push({ createdById: filters.createdById });
        }

        // ROLE-BASED FILTERING LOGIC
        if (filters.currentRoleId) {
            if (filters.roleFilterMode === "pending") {
                // Pending Mode: Show items currently at this step waiting for action
                // AND ensure this role hasn't processed it yet (optional safeguard)
                if (filters.currentStep !== undefined) {
                    andConditions.push({
                        AND: [
                            { currentStep: filters.currentStep },
                            {
                                history: {
                                    none: {
                                        roleId: filters.currentRoleId,
                                        action: { in: ["approve", "reject"] }, // Exclude if already decided
                                    },
                                },
                            },
                        ],
                    });
                }
            } else if (filters.roleFilterMode === "processed") {
                // Processed Mode: Show items where this role has an entry in history
                // UNLESS it's rejected by someone else later (optional refinement)
                // We use 'some' to check if ANY history entry matches this role
                andConditions.push({
                    history: {
                        some: {
                            roleId: filters.currentRoleId,
                        },
                    },
                });

                // Optional: For "Selesai" page, typically we want items that have moved PAST this step
                // or are completed/rejected.
                if (filters.processedByStep !== undefined) {
                    andConditions.push({
                        OR: [
                            { currentStep: { gt: filters.processedByStep } }, // Moved to next step
                            { status: { in: ["COMPLETED", "REJECTED"] } }, // Final states
                        ],
                    });
                }
            } else if (filters.roleFilterMode === "relevant") {
                // Relevant Mode: Show items Pending (at my step) OR Processed (by me)
                // Requires filters.currentStep (my step) to be set
                const conditions: any[] = [];

                // 1. Pending at my step
                if (filters.currentStep !== undefined) {
                    conditions.push({
                        AND: [
                            { currentStep: filters.currentStep },
                            {
                                history: {
                                    none: {
                                        roleId: filters.currentRoleId,
                                    },
                                },
                            },
                        ],
                    });
                }

                // 2. Processed by me
                conditions.push({
                    history: {
                        some: {
                            roleId: filters.currentRoleId,
                        },
                    },
                });

                andConditions.push({ OR: conditions });
            } else if (filters.roleFilterMode === "all") {
                // All Mode: Show generic list OR if strictly for inbox, maybe just all history?
                // Currently 'all' might just be generic list without specific constraints
                // unless we want to limit to "ever touched by this role"
                // For now, let's leave it open or add specific logic if needed.
            }
        } else {
            // Fallback for non-role specific queries (like Student view or Admin view)
            if (filters.currentStep !== undefined) {
                andConditions.push({ currentStep: filters.currentStep });
            }
        }

        // Fix for "Supervisor Akademik" seeing items meant for TU (Step 1 vs Step 2)
        // If currentStep is explicitly passed in filters (outside of role logic), enforce it.
        // But in "pending" mode above, we already enforced it.
        // This block handles the generic case if roleFilterMode isn't set but currentStep is.
        if (!filters.currentRoleId && filters.currentStep !== undefined) {
            andConditions.push({ currentStep: filters.currentStep });
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

        // Get all matching applications
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
                    letterType: true,
                    history: {
                        include: {
                            role: true,
                        },
                        orderBy: { createdAt: "asc" },
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
                letterType: true,
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
            roleId?: string | null; // Add roleId to history
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

            // 2. Create History Log with Role
            await tx.letterHistory.create({
                data: {
                    letterInstanceId: id,
                    actorId: history.actorId,
                    action: history.action,
                    note: history.note,
                    status: data.status,
                    ...(history.roleId ? { roleId: history.roleId } : {}),
                },
            });

            return updated;
        });
    }

    static async getStats(
        letterTypeId: string,
        filters: {
            createdById?: string;
            currentRoleId?: string;
            currentStep?: number;
        } = {},
    ) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLast30Days = new Date();
        startOfLast30Days.setDate(now.getDate() - 30);

        // 1. Base filter
        const baseWhere: any = { letterTypeId, status: { not: "DRAFT" } };

        // 2. Define "Relevant" items for this user/role
        let relevantWhere: any = { ...baseWhere };

        if (filters.createdById) {
            relevantWhere.createdById = filters.createdById;
        } else if (filters.currentRoleId && filters.currentStep !== undefined) {
            // Reviewer Relevant: (At my step AND not processed) OR (Processed by me)
            relevantWhere.OR = [
                {
                    AND: [
                        { currentStep: filters.currentStep },
                        {
                            history: {
                                none: {
                                    roleId: filters.currentRoleId,
                                    action: { in: ["approve", "reject"] },
                                },
                            },
                        },
                    ],
                },
                {
                    history: {
                        some: {
                            roleId: filters.currentRoleId,
                        },
                    },
                },
            ];
        }

        // 3. Define specific "Pending" and "Processed/Completed" queries for the role
        const pendingWhere: any = { ...baseWhere };
        const processedWhere: any = { ...baseWhere };

        if (filters.createdById) {
            pendingWhere.createdById = filters.createdById;
            pendingWhere.status = "PENDING";

            processedWhere.createdById = filters.createdById;
            processedWhere.status = "COMPLETED";
        } else if (filters.currentRoleId && filters.currentStep !== undefined) {
            // Role Pending: Items currently waiting at user's step
            pendingWhere.currentStep = filters.currentStep;
            pendingWhere.history = {
                none: {
                    roleId: filters.currentRoleId,
                    action: { in: ["approve", "reject"] },
                },
            };

            // Role Processed: Items this user has ever handled
            processedWhere.history = {
                some: {
                    roleId: filters.currentRoleId,
                },
            };
        }

        const [
            totalCount,
            pendingCount,
            completedCount,
            rejectedCount, // In the context of relevant items
            totalThisMonth,
            processedThisMonth,
            trendData,
        ] = await Promise.all([
            // Overall relevant counts
            db.letterInstance.count({ where: relevantWhere }),
            // Pending counts
            db.letterInstance.count({ where: pendingWhere }),
            // Total completed (global status COMPLETED) within relevant items
            db.letterInstance.count({
                where: { ...relevantWhere, status: "COMPLETED" },
            }),
            // Total rejected (global status REJECTED) within relevant items
            db.letterInstance.count({
                where: { ...relevantWhere, status: "REJECTED" },
            }),
            // Total relevant items created this month
            db.letterInstance.count({
                where: {
                    ...relevantWhere,
                    createdAt: { gte: startOfMonth },
                },
            }),
            // Items processed by this role this month
            db.letterInstance.count({
                where: {
                    ...processedWhere,
                    // Check history for month if possible, but updatedAt is a proxy for now
                    updatedAt: { gte: startOfMonth },
                },
            }),
            // Trend data for relevant items
            db.letterInstance.findMany({
                where: {
                    ...relevantWhere,
                    createdAt: { gte: startOfLast30Days },
                },
                select: { createdAt: true },
            }),
        ]);

        // Process status distribution within relevant items
        const distribution = await Promise.all([
            db.letterInstance.count({
                where: { ...relevantWhere, status: "PENDING" },
            }),
            db.letterInstance.count({
                where: { ...relevantWhere, status: "IN_PROGRESS" },
            }),
            db.letterInstance.count({
                where: { ...relevantWhere, status: "COMPLETED" },
            }),
            db.letterInstance.count({
                where: { ...relevantWhere, status: "REJECTED" },
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
            const dateStr = item.createdAt?.toISOString().split("T")[0] || "";
            if (dateStr && trendMap.has(dateStr)) {
                trendMap.set(dateStr, (trendMap.get(dateStr) || 0) + 1);
            }
        });

        const trend = Array.from(trendMap.entries())
            .map(([date, count]) => ({ date, count }))
            .reverse();

        return {
            total: totalCount,
            pending: pendingCount,
            completed: completedCount, // Total completed in my scope
            rejected: rejectedCount,
            totalCreatedThisMonth: totalThisMonth,
            totalCompletedThisMonth: processedThisMonth, // "Selesai Bulan Ini" context for role
            trend,
            distribution: {
                pending: distribution[0],
                inProgress: distribution[1],
                completed: distribution[2],
                rejected: distribution[3],
            },
        };
    }
}
