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
        // Find Supervisor role for currentRoleId
        const supervisorRole = await db.role.findUnique({
            where: { name: "SUPERVISOR" },
        });

        return await db.$transaction(async (tx) => {
            // 1. Create letter instance
            const letterInstance = await tx.letterInstance.create({
                data: {
                    scholarshipName: data.namaBeasiswa,
                    values: data.values || {},
                    status: (data.status as any) || "PENDING",
                    currentStep: 1,
                    letterTypeId: data.letterTypeId,
                    createdById: data.userId,
                    currentRoleId: supervisorRole?.id || null,
                    schema: {},
                },
            });

            // 2. Create initial history entry for submission
            await tx.letterHistory.create({
                data: {
                    letterInstanceId: letterInstance.id,
                    actorId: data.userId,
                    action: "submit",
                    note: "Initial submission",
                    status: "PENDING",
                    roleId: null, // Mahasiswa doesn't have roleId
                },
            });

            return letterInstance;
        });
    }

    static async updateApplicationData(
        id: string,
        data: {
            namaBeasiswa?: string;
            values?: any;
            status?: string;
            currentStep?: number;
            currentRoleId?: string | null;
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
                ...(data.currentStep !== undefined
                    ? { currentStep: data.currentStep }
                    : {}),
                ...(data.currentRoleId !== undefined
                    ? { currentRoleId: data.currentRoleId }
                    : {}),
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
        roleFilterMode?: "processed" | "pending" | "all"; // New filter mode
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

        // Only filter by currentStep if NOT in "processed" or "all" mode
        // In "processed"/"all" mode, we want to see all letters that have been processed by the role,
        // regardless of where they are now in the workflow
        if (
            filters.currentStep !== undefined &&
            filters.roleFilterMode !== "processed" &&
            filters.roleFilterMode !== "all"
        ) {
            andConditions.push({ currentStep: filters.currentStep });
        }

        if (filters.createdById) {
            andConditions.push({ createdById: filters.createdById });
        }

        // For role-based inbox view, don't filter by currentRoleId in WHERE clause
        // for "processed" and "all" modes - we'll filter by history in post-query
        if (
            filters.currentRoleId &&
            filters.roleFilterMode !== "processed" &&
            filters.roleFilterMode !== "all"
        ) {
            andConditions.push({ currentRoleId: filters.currentRoleId });
        }

        // Note: processedByStep filter removed - we now use history-based filtering
        // for "processed" mode in the post-query filter below

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

        // Get all matching applications (we'll filter by role history in JS)
        const allItems = await db.letterInstance.findMany({
            where,
            orderBy: { createdAt: sortOrder },
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
        });

        // Filter by role history if needed
        let filteredItems = allItems;

        if (filters.currentRoleId && filters.roleFilterMode === "processed") {
            // For role inbox: only show letters that have been processed by this role
            // BUT exclude letters that are currently waiting for action from this role
            filteredItems = allItems.filter((letter) => {
                // Check if this role has any history entry for this letter
                const roleHistory = letter.history?.filter(
                    (h) => h.roleId === filters.currentRoleId,
                );

                // Only show if role has processed it (has history entry)
                if (!roleHistory || roleHistory.length === 0) return false;

                // IMPORTANT: Exclude letters currently waiting for action from this role
                // If letter is currently at this role (currentRoleId matches),
                // it should appear in "Pending" inbox, not "Processed" inbox
                if (letter.currentRoleId === filters.currentRoleId) {
                    return false;
                }

                // Don't show if status is REJECTED and role is not the one who rejected it
                if (letter.status === "REJECTED") {
                    return roleHistory.some((h) => h.action === "reject");
                }

                // For REVISION status, show if this role requested the revision
                // AND the letter is not back at this role (already checked above)
                if (letter.status === "REVISION") {
                    return roleHistory.some((h) => h.action === "revision");
                }

                return true;
            });
        } else if (
            filters.currentRoleId &&
            filters.roleFilterMode === "pending"
        ) {
            // For role "pending" inbox: show letters currently at their step that haven't been processed yet
            // OR letters that have been revised and resubmitted
            filteredItems = allItems.filter((letter) => {
                // Get all history entries for this role
                const roleHistory = letter.history?.filter(
                    (h) => h.roleId === filters.currentRoleId,
                );

                // If role hasn't processed this letter yet, show it
                if (!roleHistory || roleHistory.length === 0) {
                    return true;
                }

                // If role has processed it before, check if there's a resubmission after the last action
                // Get the latest action from this role
                const latestRoleAction = roleHistory.sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                )[0];

                // If latest action was revision, check if there's a newer resubmission
                if (latestRoleAction?.action === "revision") {
                    // Find the most recent resubmission
                    const resubmissions = letter.history?.filter(
                        (h) =>
                            h.action === "resubmit" &&
                            h.actorId === letter.createdById,
                    );

                    if (resubmissions && resubmissions.length > 0) {
                        const latestResubmit = resubmissions.sort(
                            (a, b) =>
                                new Date(b.createdAt).getTime() -
                                new Date(a.createdAt).getTime(),
                        )[0];

                        // If resubmission is after the revision, show the letter
                        if (latestResubmit && latestRoleAction) {
                            const isAfter =
                                new Date(latestResubmit.createdAt) >
                                new Date(latestRoleAction.createdAt);
                            if (isAfter) return true;
                        }
                    }
                }

                // Otherwise, don't show (already processed and no new resubmission)
                return false;
            });
        } else if (filters.currentRoleId && filters.roleFilterMode === "all") {
            // For dashboard "all" mode: show both pending and processed letters
            // Show letters that are CURRENTLY at this role OR have been PROCESSED by this role
            filteredItems = allItems.filter((letter) => {
                // Show if letter is currently at this role (pending action)
                if (letter.currentRoleId === filters.currentRoleId) {
                    return true;
                }

                // Show if letter has been processed by this role (in history)
                const roleHistory = letter.history?.filter(
                    (h) => h.roleId === filters.currentRoleId,
                );

                if (roleHistory && roleHistory.length > 0) {
                    return true;
                }

                // Don't show letters that have never been to this role
                return false;
            });
        }

        // Apply pagination on filtered results
        const paginatedItems = filteredItems.slice(skip, skip + limit);
        const total = filteredItems.length;

        return {
            items: paginatedItems,
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
                        role: true,
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
            const dateStr = item.createdAt?.toISOString().split("T")[0] || "";
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
