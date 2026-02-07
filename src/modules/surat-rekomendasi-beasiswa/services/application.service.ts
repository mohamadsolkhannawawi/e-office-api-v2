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
        console.log(
            "💾 [ApplicationService.createApplication] Starting with:",
            {
                namaBeasiswa: data.namaBeasiswa,
                userId: data.userId,
                letterTypeId: data.letterTypeId,
            },
        );

        // Find Supervisor role for currentRoleId
        const supervisorRole = await db.role.findUnique({
            where: { name: "SUPERVISOR" },
        });

        console.log(
            "👤 [ApplicationService.createApplication] Supervisor role:",
            {
                id: supervisorRole?.id,
                name: supervisorRole?.name,
            },
        );

        return await db.$transaction(async (tx) => {
            console.log(
                "📦 [ApplicationService.createApplication] Starting transaction...",
            );

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

            console.log(
                "✅ [ApplicationService.createApplication] LetterInstance created:",
                {
                    id: letterInstance.id,
                    scholarshipName: letterInstance.scholarshipName,
                    status: letterInstance.status,
                },
            );

            // 2. Create initial history entry for submission
            const history = await tx.letterHistory.create({
                data: {
                    letterInstanceId: letterInstance.id,
                    actorId: data.userId,
                    action: "submit",
                    note: "Initial submission",
                    status: "PENDING",
                    roleId: null, // Mahasiswa doesn't have roleId
                },
            });

            console.log(
                "📝 [ApplicationService.createApplication] History created:",
                {
                    id: history.id,
                    letterInstanceId: history.letterInstanceId,
                },
            );

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

        const andConditions: any[] = [
            { letterTypeId: filters.letterTypeId },
            { deletedAt: null }, // Exclude soft-deleted applications
        ];

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

        // Date filtering - only apply if valid date strings are provided
        const hasValidStartDate =
            filters.startDate &&
            filters.startDate.trim() !== "" &&
            !isNaN(Date.parse(filters.startDate));
        const hasValidEndDate =
            filters.endDate &&
            filters.endDate.trim() !== "" &&
            !isNaN(Date.parse(filters.endDate));

        console.log("📅 Date Filter Check:", {
            rawStartDate: filters.startDate,
            rawEndDate: filters.endDate,
            hasValidStartDate,
            hasValidEndDate,
        });

        if (hasValidStartDate || hasValidEndDate) {
            const dateFilter: any = {};
            if (hasValidStartDate && filters.startDate) {
                // Parse the ISO string directly - it already contains the correct timezone info
                const startDate = new Date(filters.startDate);
                dateFilter.gte = startDate;
                console.log("📅 Start Date Filter:", {
                    input: filters.startDate,
                    parsed: startDate.toISOString(),
                    gte: dateFilter.gte.toISOString(),
                });
            }
            if (hasValidEndDate && filters.endDate) {
                // Parse the ISO string directly - it already contains the correct timezone info
                const endDate = new Date(filters.endDate);
                dateFilter.lte = endDate;
                console.log("📅 End Date Filter:", {
                    input: filters.endDate,
                    parsed: endDate.toISOString(),
                    lte: dateFilter.lte.toISOString(),
                });
            }
            andConditions.push({ createdAt: dateFilter });
            console.log("📅 Final Date Filter Applied:", {
                gte: dateFilter.gte?.toISOString(),
                lte: dateFilter.lte?.toISOString(),
            });
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
        console.log("Sorting:", {
            sortOrder,
            updatedAtOrder: sortOrder,
            createdAtOrder: sortOrder,
        });

        // Get all matching applications (we'll filter by role history in JS)
        const allItems = await db.letterInstance.findMany({
            where,
            orderBy: [{ updatedAt: sortOrder }, { createdAt: sortOrder }],
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
                        actor: {
                            include: {
                                userRole: {
                                    include: {
                                        role: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
        });

        // Filter by role history if needed
        let filteredItems = allItems;

        if (filters.currentRoleId && filters.roleFilterMode === "processed") {
            // SELESAI: Letters that have been PROCESSED by this role AND are NO LONGER at this role
            // Based on TRACKING as single source of truth:
            // - Role has history entry (approve/reject/revision)
            // - currentRoleId != this role (already moved to next step or back to student)
            filteredItems = allItems.filter((letter) => {
                // Must have history from this role
                const roleHistory = letter.history?.filter(
                    (h) => h.roleId === filters.currentRoleId,
                );

                if (!roleHistory || roleHistory.length === 0) return false;

                // Must NOT currently be at this role (if it is, should be in "Perlu Tindakan")
                // Check BOTH currentRoleId and currentStep to be safe
                const isCurrentlyAtThisRole =
                    letter.currentRoleId === filters.currentRoleId ||
                    (letter.currentStep === filters.currentStep &&
                        ["PENDING", "IN_PROGRESS", "REVISION"].includes(
                            letter.status as string,
                        ));

                if (isCurrentlyAtThisRole) {
                    console.log("🚫 Excluding from SELESAI (still at role):", {
                        id: letter.id,
                        scholarshipName: letter.scholarshipName,
                        currentRoleId: letter.currentRoleId,
                        currentStep: letter.currentStep,
                        status: letter.status,
                        filterRoleId: filters.currentRoleId,
                        filterStep: filters.currentStep,
                    });
                    return false;
                }

                console.log("✅ Including in SELESAI:", {
                    id: letter.id,
                    scholarshipName: letter.scholarshipName,
                    currentRoleId: letter.currentRoleId,
                    currentStep: letter.currentStep,
                    status: letter.status,
                });

                // Show the letter (it was processed and has moved on)
                return true;
            });
        } else if (
            filters.currentRoleId &&
            filters.roleFilterMode === "pending"
        ) {
            // PERLU TINDAKAN: Letters currently at this role's step that need action
            // Based on TRACKING as single source of truth:
            // - currentStep matches role's step
            // - currentRoleId matches this role
            // - Status is PENDING, IN_PROGRESS, or REVISION
            filteredItems = allItems.filter((letter) => {
                // Must be currently at this role's step
                const isAtThisRole =
                    letter.currentRoleId === filters.currentRoleId &&
                    letter.currentStep === filters.currentStep;

                if (!isAtThisRole) return false;

                // Must be in actionable status
                const isActionable = [
                    "PENDING",
                    "IN_PROGRESS",
                    "REVISION",
                ].includes(letter.status as string);

                if (!isActionable) return false;

                console.log("📋 Including in PERLU TINDAKAN:", {
                    id: letter.id,
                    scholarshipName: letter.scholarshipName,
                    currentRoleId: letter.currentRoleId,
                    currentStep: letter.currentStep,
                    status: letter.status,
                });

                return true;
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

        // Re-sort filteredItems based on sortOrder since filtering can change order
        filteredItems.sort((a, b) => {
            // Primary sort: updatedAt
            const aUpdated = a.updatedAt?.getTime() || 0;
            const bUpdated = b.updatedAt?.getTime() || 0;

            if (aUpdated !== bUpdated) {
                return sortOrder === "desc"
                    ? bUpdated - aUpdated
                    : aUpdated - bUpdated;
            }

            // Secondary sort: createdAt (fallback)
            const aCreated = a.createdAt?.getTime() || 0;
            const bCreated = b.createdAt?.getTime() || 0;
            return sortOrder === "desc"
                ? bCreated - aCreated
                : aCreated - bCreated;
        });

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
        return await db.letterInstance.findFirst({
            where: {
                id,
                deletedAt: null,
            },
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
                stamp: true, // 🔴 TAMBAHAN: Include stamp untuk mendapatkan stampUrl
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
            stampId?: string;
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
                    ...(data.stampId ? { stampId: data.stampId } : {}),
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

    /**
     * Get statistics for a specific role based on letters that have reached that role
     * Perlu Tindakan: Letters currently at this role (currentStep matches)
     * Selesai: Letters that were approved by this role (history shows approval)
     * Total: All letters that have reached this role
     */
    static async getStatsForRole(
        letterTypeId: string,
        roleId: string,
        roleStep: number,
    ) {
        console.log("🔍 getStatsForRole called with:", {
            letterTypeId,
            roleId,
            roleStep,
        });

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLast30Days = new Date();
        startOfLast30Days.setDate(now.getDate() - 30);

        // Base where clause
        const baseWhere: any = { letterTypeId, status: { not: "DRAFT" } };

        // 1. PERLU TINDAKAN: Letters currently at this role's step and pending action
        // Include REVISION status as letters may be returned to this role for revision
        const perluTindakanRecords = await db.letterInstance.findMany({
            where: {
                ...baseWhere,
                currentStep: roleStep,
                currentRoleId: roleId,
                OR: [
                    { status: "PENDING" },
                    { status: "IN_PROGRESS" },
                    // Include REVISION if it's at this step (role needs to review again)
                    {
                        status: "REVISION",
                        currentStep: roleStep,
                        currentRoleId: roleId,
                    },
                ],
            },
            select: { id: true, status: true, currentStep: true },
        });

        const perluTindakan = perluTindakanRecords.length;

        console.log("📝 Perlu Tindakan:", {
            count: perluTindakan,
            records: perluTindakanRecords,
        });

        // 2. SELESAI (Bulan Ini): Unique letters that were PROCESSED by this role and are NO LONGER at this role in this month
        // This matches the "mode=processed" logic from the applications list
        // Count distinct letterInstanceId where:
        // - This role has history (approve/reject/revision)
        // - Letter is no longer at this role (currentRoleId != this roleId OR moved to next step)
        // - Created/processed in this month
        const selesaiBulanIniRecords = await db.letterHistory.findMany({
            where: {
                roleId: roleId,
                createdAt: { gte: startOfMonth },
                letterInstance: {
                    letterTypeId: letterTypeId,
                    status: { not: "DRAFT" },
                },
            },
            select: {
                id: true,
                action: true,
                createdAt: true,
                letterInstanceId: true,
                letterInstance: {
                    select: {
                        id: true,
                        currentRoleId: true,
                        currentStep: true,
                        status: true,
                    },
                },
            },
            distinct: ["letterInstanceId"],
        });

        // Filter to only include letters that are NO LONGER at this role
        const selesaiBulanIniFiltered = selesaiBulanIniRecords.filter(
            (record) => {
                const letter = record.letterInstance;
                // Exclude if letter is still at this role
                const isCurrentlyAtThisRole =
                    letter.currentRoleId === roleId ||
                    (letter.currentStep === roleStep &&
                        ["PENDING", "IN_PROGRESS", "REVISION"].includes(
                            letter.status as string,
                        ));

                return !isCurrentlyAtThisRole;
            },
        );

        const selesaiBulanIni = selesaiBulanIniFiltered.length;

        console.log("✅ Selesai Bulan Ini:", {
            count: selesaiBulanIni,
            records: selesaiBulanIniFiltered.map((r) => ({
                id: r.id,
                letterInstanceId: r.letterInstanceId,
                action: r.action,
                currentRoleId: r.letterInstance.currentRoleId,
                currentStep: r.letterInstance.currentStep,
                status: r.letterInstance.status,
            })),
        });

        // 3. TOTAL SURAT (Bulan Ini): All unique letters that reached this role this month
        // Find unique letters where:
        // - This role took action (approve, reject, revision), OR
        // - Letter currently at this role (might not have history yet if just arrived)
        const monthlyHistoryLetters = await db.letterHistory.findMany({
            where: {
                roleId: roleId,
                createdAt: { gte: startOfMonth },
                letterInstance: {
                    letterTypeId: letterTypeId,
                    status: { not: "DRAFT" },
                },
            },
            select: { letterInstanceId: true },
            distinct: ["letterInstanceId"],
        });

        const monthlyCurrentLetters = await db.letterInstance.findMany({
            where: {
                ...baseWhere,
                currentRoleId: roleId,
                currentStep: roleStep,
                createdAt: { gte: startOfMonth },
            },
            select: { id: true },
        });

        // Combine and deduplicate
        const allLetterIds = new Set([
            ...monthlyHistoryLetters.map((l) => l.letterInstanceId),
            ...monthlyCurrentLetters.map((l) => l.id),
        ]);

        const totalBulanIni = allLetterIds.size;

        console.log("📊 Total Bulan Ini:", {
            count: totalBulanIni,
            fromHistory: monthlyHistoryLetters.length,
            currentlyAtRole: monthlyCurrentLetters.length,
        });

        // 4. TREN VOLUME 30 HARI: Letters that reached this role in last 30 days
        const trendLetters = await db.letterHistory.findMany({
            where: {
                roleId: roleId,
                createdAt: { gte: startOfLast30Days },
                letterInstance: {
                    letterTypeId: letterTypeId,
                    status: { not: "DRAFT" },
                },
            },
            select: { createdAt: true, letterInstanceId: true },
        });

        // Process trend data - count unique letters per day
        const trendMap = new Map<string, Set<string>>();
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(now.getDate() - i);
            trendMap.set(date.toISOString().split("T")[0] || "", new Set());
        }

        trendLetters.forEach((item) => {
            const dateStr = item.createdAt?.toISOString().split("T")[0] || "";
            if (dateStr && trendMap.has(dateStr)) {
                trendMap.get(dateStr)?.add(item.letterInstanceId);
            }
        });

        const trend = Array.from(trendMap.entries())
            .map(([date, letterIds]) => ({ date, count: letterIds.size }))
            .reverse();

        // 5. DISTRIBUSI STATUS: Count letters by their current status that have reached this role
        // Include both letters processed by this role AND letters currently at this role
        const distributionHistoryLetters = await db.letterHistory.findMany({
            where: {
                roleId: roleId,
                letterInstance: {
                    letterTypeId: letterTypeId,
                    status: { not: "DRAFT" },
                },
            },
            select: { letterInstanceId: true },
            distinct: ["letterInstanceId"],
        });

        const distributionCurrentLetters = await db.letterInstance.findMany({
            where: {
                ...baseWhere,
                currentRoleId: roleId,
                currentStep: roleStep,
            },
            select: { id: true },
        });

        // Combine and deduplicate all letters that have reached or are at this role
        const allLetterIdsSet = new Set([
            ...distributionHistoryLetters.map((l) => l.letterInstanceId),
            ...distributionCurrentLetters.map((l) => l.id),
        ]);

        const letterIds = Array.from(allLetterIdsSet);

        const [pending, inProgress, revision, completed, rejected] =
            await Promise.all([
                db.letterInstance.count({
                    where: { id: { in: letterIds }, status: "PENDING" },
                }),
                db.letterInstance.count({
                    where: { id: { in: letterIds }, status: "IN_PROGRESS" },
                }),
                db.letterInstance.count({
                    where: { id: { in: letterIds }, status: "REVISION" },
                }),
                db.letterInstance.count({
                    where: { id: { in: letterIds }, status: "COMPLETED" },
                }),
                db.letterInstance.count({
                    where: { id: { in: letterIds }, status: "REJECTED" },
                }),
            ]);

        console.log("📈 Distribusi:", {
            pending,
            inProgress,
            revision,
            completed,
            rejected,
        });

        return {
            perluTindakan,
            selesaiBulanIni,
            totalBulanIni,
            trend,
            distribution: {
                pending,
                inProgress,
                revision,
                completed,
                rejected,
            },
        };
    }

    static async deleteApplication(id: string, userId: string) {
        // Verify the application belongs to the user
        const application = await db.letterInstance.findUnique({
            where: { id },
        });

        if (!application) {
            throw new Error("Application not found");
        }

        if (application.createdById !== userId) {
            throw new Error("Unauthorized: Cannot delete this application");
        }

        // Only allow deletion if status is DRAFT
        if (application.status !== "DRAFT") {
            throw new Error("Can only delete applications with DRAFT status");
        }

        // Soft delete by setting deletedAt timestamp
        return await db.letterInstance.update({
            where: { id },
            data: {
                deletedAt: new Date(),
            },
        });
    }
}
