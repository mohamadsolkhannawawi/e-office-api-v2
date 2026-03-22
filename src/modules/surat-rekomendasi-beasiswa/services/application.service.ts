import { Prisma } from "../../../db/index.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";

const db = Prisma;

/**
 * [HELPER] hasLetterBeenProcessedByRole - Cek apakah letter sudah diproses role tertentu
 *
 * Verifikasi apakah role tertentu sudah punya action (approve/reject/revision) pada letter ini.
 * Digunakan untuk tracking approval workflow dan history.
 *
 * @param letterInstanceId - ID letter instance
 * @param roleId - ID role yang dicek
 * @returns true jika role punya action history, false sebaliknya
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
 * [HELPER] getLatestRoleActionStatus - Ambil latest status action dari role tertentu
 *
 * Fetch status terbaru dari aksi role (approve/reject/revision) pada letter.
 * Berguna untuk determine apakah letter di-reject atau di-revise oleh role tersebut.
 *
 * @param letterInstanceId - ID letter instance
 * @param roleId - ID role yang dicek
 * @returns status terbaru (PENDING, IN_PROGRESS, REVISION, REJECTED, COMPLETED) atau null
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
  /**
   * [SERVICE] createApplication - Buat letter instance baru untuk aplikasi SRB
   *
   * Membuat aplikasi baru dengan initial state PENDING atau DRAFT.
   * Juga membuat initial history entry untuk track submission.
   * Menggunakan transaction untuk ensure data consistency.
   *
   * @param data - { namaBeasiswa, values, userId, letterTypeId, status? }
   * @returns Newly created letterInstance dengan history entry
   */
  static async createApplication(data: {
    namaBeasiswa: string;
    values: any;
    userId: string;
    letterTypeId: string;
    status?: string;
  }) {
    console.log("[PROCESSING] Membuat application baru dengan:", {
      namaBeasiswa: data.namaBeasiswa,
      userId: data.userId,
      letterTypeId: data.letterTypeId,
    });

    // Cari Supervisor role untuk currentRoleId
    const supervisorRole = await db.role.findUnique({
      where: { name: "SUPERVISOR" },
    });

    console.log("[INFO] Supervisor role ditemukan:", {
      id: supervisorRole?.id,
      name: supervisorRole?.name,
    });

    return await db.$transaction(async (tx) => {
      console.log("[PROCESSING] Memulai database transaction...");

      // 1. Buat letter instance
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

      console.log("[SUCCESS] LetterInstance berhasil dibuat:", {
        id: letterInstance.id,
        scholarshipName: letterInstance.scholarshipName,
        status: letterInstance.status,
      });

      // 2. Buat initial history entry untuk submission
      const history = await tx.letterHistory.create({
        data: {
          letterInstanceId: letterInstance.id,
          actorId: data.userId,
          action: "submit",
          note: "Initial submission",
          status: "PENDING",
          roleId: null, // Mahasiswa tidak punya roleId
        },
      });

      console.log("[INFO] History entry berhasil dibuat:", {
        id: history.id,
        letterInstanceId: history.letterInstanceId,
      });

      return letterInstance;
    });
  }

  /**
   * [SERVICE] updateApplicationData - Update data aplikasi (nama, values, status, step)
   *
   * Update field-field aplikasi tanpa create history entry baru.
   * Digunakan untuk non-approval updates seperti form changes sebelum submit.
   *
   * @param id - Letter instance ID
   * @param data - Partial update data (namaBeasiswa, values, status, currentStep, currentRoleId)
   * @returns Updated letterInstance
   */
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
    console.log(
      "[PROCESSING] Update application data untuk ID:",
      id,
      "dengan:",
      data,
    );

    const updated = await db.letterInstance.update({
      where: { id },
      data: {
        ...(data.namaBeasiswa ? { scholarshipName: data.namaBeasiswa } : {}),
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

    console.log("[SUCCESS] Application data berhasil diupdate:", {
      id: updated.id,
    });
    return updated;
  }

  /**
   * [SERVICE] listApplications - Query list aplikasi dengan advanced filtering
   *
   * Fetch daftar aplikasi dengan support untuk:
   * - Status filtering (single atau multiple)
   * - Role-based filtering (pending, processed, all modes)
   * - Date range filtering (createdAt)
   * - Full-text search (scholarship name, student name, NIM)
   * - Pagination dan sorting (by updatedAt, createdAt)
   * - Jenis beasiswa filtering
   *
   * Role Filter Modes:
   * - pending: Letters currently at role's step awaiting action
   * - processed: Letters already processed by role (history-based)
   * - all: Show both pending dan processed letters
   *
   * @param filters - Complex filter configuration
   * @returns { items: applications[], total, page, limit, totalPages }
   */
  static async listApplications(filters: {
    status?: string | string[];
    currentStep?: number;
    letterTypeId: string;
    page?: number;
    limit?: number;
    createdById?: string;
    currentRoleId?: string;
    jenisBeasiswa?: string;
    excludeJenisBeasiswa?: string;
    search?: string;
    excludeStatus?: string[];
    startDate?: string;
    endDate?: string;
    sortOrder?: "asc" | "desc";
    processedByStep?: number;
    roleFilterMode?: "processed" | "pending" | "all";
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
    // Dalam "processed"/"all" mode, ingin lihat semua letters yang sudah diproses role ini,
    // regardless of di mana mereka dalam workflow saat ini
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

    // Untuk role-based inbox view, jangan filter by currentRoleId di WHERE clause
    // untuk "processed" dan "all" modes - kami akan filter by history setelah query
    if (
      filters.currentRoleId &&
      filters.roleFilterMode !== "processed" &&
      filters.roleFilterMode !== "all"
    ) {
      andConditions.push({ currentRoleId: filters.currentRoleId });
    }

    // Catatan: processedByStep filter dihapus - sekarang use history-based filtering
    // untuk "processed" mode di post-query filter bawah

    if (filters.jenisBeasiswa && filters.jenisBeasiswa !== "ALL") {
      andConditions.push({
        values: {
          path: ["jenisBeasiswa"],
          equals: filters.jenisBeasiswa,
        },
      });
    }

    if (filters.excludeJenisBeasiswa) {
      andConditions.push({
        NOT: {
          values: {
            path: ["jenisBeasiswa"],
            equals: filters.excludeJenisBeasiswa,
          },
        },
      });
    }

    // Date filtering - hanya apply jika valid date strings diberikan
    const hasValidStartDate =
      filters.startDate &&
      filters.startDate.trim() !== "" &&
      !isNaN(Date.parse(filters.startDate));
    const hasValidEndDate =
      filters.endDate &&
      filters.endDate.trim() !== "" &&
      !isNaN(Date.parse(filters.endDate));

    console.log("[INFO] Date Filter Check:", {
      rawStartDate: filters.startDate,
      rawEndDate: filters.endDate,
      hasValidStartDate,
      hasValidEndDate,
    });

    if (hasValidStartDate || hasValidEndDate) {
      const dateFilter: any = {};
      if (hasValidStartDate && filters.startDate) {
        // Parse ISO string langsung - sudah contain timezone info yang benar
        const startDate = new Date(filters.startDate);
        dateFilter.gte = startDate;
        console.log("[INFO] Start Date Filter:", {
          input: filters.startDate,
          parsed: startDate.toISOString(),
          gte: dateFilter.gte.toISOString(),
        });
      }
      if (hasValidEndDate && filters.endDate) {
        // Parse ISO string langsung - sudah contain timezone info yang benar
        const endDate = new Date(filters.endDate);
        dateFilter.lte = endDate;
        console.log("[INFO] End Date Filter:", {
          input: filters.endDate,
          parsed: endDate.toISOString(),
          lte: dateFilter.lte.toISOString(),
        });
      }
      andConditions.push({ createdAt: dateFilter });
      console.log("[INFO] Final Date Filter Applied:", {
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
      "[PROCESSING] List applications dengan where:",
      JSON.stringify(where, null, 2),
    );
    console.log("[INFO] Sorting:", {
      sortOrder,
      updatedAtOrder: sortOrder,
      createdAtOrder: sortOrder,
    });

    // Ambil semua matching applications (kami akan filter by role history di JS)
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

    // Filter by role history jika diperlukan
    let filteredItems = allItems;

    if (filters.currentRoleId && filters.roleFilterMode === "processed") {
      // SELESAI: Letters yang sudah DIPROSES role ini DAN tidak lagi di role ini
      // Berdasarkan TRACKING sebagai single source of truth:
      // - Role punya history entry (approve/reject/revision)
      // - currentRoleId != role ini (sudah move ke next step atau balik ke student)
      filteredItems = allItems.filter((letter) => {
        // Harus punya history dari role ini
        const roleHistory = letter.history?.filter(
          (h) => h.roleId === filters.currentRoleId,
        );

        if (!roleHistory || roleHistory.length === 0) return false;

        // Tidak harus currently di role ini (jika ada, should be di "Perlu Tindakan")
        // Cek BOTH currentRoleId dan currentStep untuk safety
        const isCurrentlyAtThisRole =
          letter.currentRoleId === filters.currentRoleId ||
          (letter.currentStep === filters.currentStep &&
            ["PENDING", "IN_PROGRESS", "REVISION"].includes(
              letter.status as string,
            ));

        if (isCurrentlyAtThisRole) {
          console.log("[INFO] Exclude dari SELESAI (masih di role):", {
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

        console.log("[INFO] Include di SELESAI:", {
          id: letter.id,
          scholarshipName: letter.scholarshipName,
          currentRoleId: letter.currentRoleId,
          currentStep: letter.currentStep,
          status: letter.status,
        });

        // Tampilkan letter (sudah diproses dan has moved on)
        return true;
      });
    } else if (filters.currentRoleId && filters.roleFilterMode === "pending") {
      // PERLU TINDAKAN: Letters currently di role's step yang need action
      // Berdasarkan TRACKING sebagai single source of truth:
      // - currentStep match dengan role's step
      // - currentRoleId match dengan role ini
      // - Status adalah PENDING, IN_PROGRESS, atau REVISION
      filteredItems = allItems.filter((letter) => {
        // Harus currently di role's step ini
        const isAtThisRole =
          letter.currentRoleId === filters.currentRoleId &&
          letter.currentStep === filters.currentStep;

        if (!isAtThisRole) return false;

        // Harus di actionable status
        const isActionable = ["PENDING", "IN_PROGRESS", "REVISION"].includes(
          letter.status as string,
        );

        if (!isActionable) return false;

        console.log("[INFO] Include di PERLU TINDAKAN:", {
          id: letter.id,
          scholarshipName: letter.scholarshipName,
          currentRoleId: letter.currentRoleId,
          currentStep: letter.currentStep,
          status: letter.status,
        });

        return true;
      });
    } else if (filters.currentRoleId && filters.roleFilterMode === "all") {
      // Untuk dashboard "all" mode: tampilkan pending dan processed letters
      // Tampilkan letters yang CURRENTLY di role ini ATAU sudah DIPROSES role ini
      filteredItems = allItems.filter((letter) => {
        // Tampilkan jika letter currently di role ini (pending action)
        if (letter.currentRoleId === filters.currentRoleId) {
          return true;
        }

        // Tampilkan jika letter sudah diproses role ini (di history)
        const roleHistory = letter.history?.filter(
          (h) => h.roleId === filters.currentRoleId,
        );

        if (roleHistory && roleHistory.length > 0) {
          return true;
        }

        // Jangan tampilkan letters yang tidak pernah ke role ini
        return false;
      });
    }

    // Re-sort filteredItems berdasarkan sortOrder karena filtering bisa ubah order
    filteredItems.sort((a, b) => {
      // Primary sort: updatedAt
      const aUpdated = a.updatedAt?.getTime() || 0;
      const bUpdated = b.updatedAt?.getTime() || 0;

      if (aUpdated !== bUpdated) {
        return sortOrder === "desc" ? bUpdated - aUpdated : aUpdated - bUpdated;
      }

      // Secondary sort: createdAt (fallback)
      const aCreated = a.createdAt?.getTime() || 0;
      const bCreated = b.createdAt?.getTime() || 0;
      return sortOrder === "desc" ? bCreated - aCreated : aCreated - bCreated;
    });

    // Apply pagination pada filtered results
    const paginatedItems = filteredItems.slice(skip, skip + limit);
    const total = filteredItems.length;

    console.log("[SUCCESS] List applications selesai:", {
      total,
      returned: paginatedItems.length,
      page,
      limit,
    });

    return {
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * [SERVICE] getApplicationById - Fetch single application dengan full relations
   *
   * Retrieve letter instance by ID dengan semua data relations:
   * - Attachments: File yang sudah di-upload
   * - CreatedBy: Student profile dengan mahasiswa relations (departemen, programStudi)
   * - History: Full audit trail dari semua actions (diurutkan desc - newest first)
   * - Verification: Digital signature verification data
   * - LetterType: Template configuration untuk letter ini
   * - Stamp: Digital stamp data (kalau sudah certified)
   *
   * @param id - Letter instance ID
   * @returns LetterInstance dengan full relations atau null jika tidak ditemukan
   */
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
        stamp: true, // [INFO] Include stamp untuk mendapatkan stampUrl
      },
    });
  }

  /**
   * [SERVICE] updateApplicationStatus - Update status dengan atomic transaction
   *
   * Update letter status dan metadata sambil membuat history entry atomically.
   * Menggunakan Prisma transaction untuk ensure consistency:
   *
   * Atomically melakukan 2 operasi:
   * 1. Update letterInstance: status, currentStep, currentRoleId, values, dll
   * 2. Create letterHistory: Track action dengan roleId dan note
   *
   * Digunakan untuk workflow transitions:
   * - Approve: currentRoleId move ke next role
   * - Reject: currentRoleId set ke student (null), status REJECTED
   * - Revision: Keep at role, status REVISION
   * - Letter number assignment: Set saat approval final
   * - Publishing: Set publishedAt timestamp
   * - Stamping: Set stampId setelah digital stamp applied
   *
   * @param id - Letter instance ID
   * @param data - Status dan metadata updates (all optional except status)
   * @param history - Actor info at action (actorId, action, note, roleId)
   * @returns Updated letterInstance dari transaction
   */
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
      // 1. Update letter instance metadata
      console.log("[PROCESSING] Update status:", { id, ...data });
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
          ...(data.letterNumber ? { letterNumber: data.letterNumber } : {}),
          ...(data.stampId ? { stampId: data.stampId } : {}),
          ...(data.publishedAt ? { publishedAt: data.publishedAt } : {}),
        },
      });

      // 2. Create audit history entry dengan role tracking
      console.log("[INFO] Create history entry:", {
        action: history.action,
        roleId: history.roleId,
      });
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

      console.log("[SUCCESS] Status updated:", {
        id,
        newStatus: data.status,
        newRole: data.currentRoleId,
        newStep: data.currentStep,
      });
      return updated;
    });
  }

  /**
   * [SERVICE] getStats - Calculate dashboard statistics dengan parallel queries
   *
   * Fetch comprehensive statistics untuk dashboard display:
   * - Overall counts (total, pending, in_progress, completed, rejected)
   * - Monthly metrics (created this month, completed this month)
   * - 30-day trend analysis (daily creation count)
   * - Status distribution breakdown
   *
   * Stats Types:
   * - total: Semua letters (exclude DRAFT)
   * - pending: Awaiting action at first role
   * - inProgress: Being processed at intermediate roles
   * - completed: Successfully finished workflow
   * - rejected: Rejected by any role
   * - totalCreatedThisMonth: All letters started this calendar month
   * - totalCompletedThisMonth: Letters yang finished in current month
   * - trend: Daily creation counts for last 30 days (for charting)
   * - distribution: Status breakdown for pie chart visualization
   *
   * Gunakan Prisma Promise.all untuk parallel queries (efficient)
   *
   * @param letterTypeId - Filter stats untuk jenis letter tertentu
   * @param filters - Optional filters (createdById untuk per-user stats)
   * @returns { total, pending, inProgress, completed, rejected, trend, distribution }
   */
  static async getStats(letterTypeId: string, filters: any = {}) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLast30Days = new Date();
    startOfLast30Days.setDate(now.getDate() - 30);

    console.log("[PROCESSING] Calculate stats:", {
      letterTypeId,
      timeRange: {
        currentMonth: startOfMonth.toISOString(),
        last30Days: startOfLast30Days.toISOString(),
      },
    });

    // Build base filter condition (exclude draft applications)
    const baseWhere: any = { letterTypeId, status: { not: "DRAFT" } };

    if (filters.createdById) {
      baseWhere.createdById = filters.createdById;
      console.log("[INFO] Filter stats by user:", filters.createdById);
    }

    // Run semua count queries in parallel untuk efficiency
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
      // Trend data - fetch creation timestamps untuk 30-day analysis
      db.letterInstance.findMany({
        where: {
          ...baseWhere,
          createdAt: { gte: startOfLast30Days },
        },
        select: { createdAt: true },
      }),
    ]);

    console.log("[INFO] Parallel queries completed:", {
      total,
      pending,
      inProgress,
      completed,
      rejected,
    });

    // Process trend data - aggregate daily creation counts
    const trendMap = new Map<string, number>();

    // Initialize 30-day range dengan 0 counts
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(now.getDate() - i);
      trendMap.set(date.toISOString().split("T")[0] || "", 0);
    }

    // Count creations per date
    trendData.forEach((item) => {
      const dateStr = item.createdAt?.toISOString().split("T")[0] || "";
      if (dateStr && trendMap.has(dateStr)) {
        trendMap.set(dateStr, (trendMap.get(dateStr) || 0) + 1);
      }
    });

    // Convert ke array dan reverse untuk chronological order
    const trend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .reverse();

    console.log("[SUCCESS] Stats calculated:", {
      total,
      monthlyStats: {
        createdThisMonth: totalCreatedThisMonth,
        completedThisMonth: totalCompletedThisMonth,
      },
      trendDays: trend.length,
    });

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
   * [SERVICE] getStatsForRole - Calculate role-specific workflow statistics
   *
   * Fetch comprehensive statistics untuk specific role dalam workflow:
   *
   * **PERLU TINDAKAN (Action Needed):**
   * Letters yang saat ini di role's step dan menunggu aksi dari role ini
   * - Kondisi: currentStep == role's step AND currentRoleId == this role
   * - Status: PENDING, IN_PROGRESS, atau REVISION (returned for revision)
   * - Digunakan untuk: "Inbox" dengan letters needing immediate action
   *
   * **SELESAI BULAN INI (Completed This Month):**
   * Unique letters yang sudah DIPROSES role ini dan TIDAK lagi di role ini
   * - Kondisi: Role punya history entry (approve/reject/revision)
   *           AND letter moved ke next step atau balik ke student (currentRoleId != this role)
   * - Timeframe: Actions ini bulan ini (createdAt >= startOfMonth)
   * - Digunakan untuk: Dashboard "Done" tab dengan processed count
   *
   * **TOTAL BULAN INI (Total This Month):**
   * Semua unique letters yang MENCAPAI role ini bulan ini
   * - Kondisi: Role punya history (approve/reject/revision)
   *           ATAU letter currently at role (mungkin baru tiba, belum ada history)
   * - Timeframe: Bulan ini (createdAt >= startOfMonth)
   * - Digunakan untuk: Total volume metrics
   *
   * **TREN VOLUME 30 HARI (30-Day Trend):**
   * Daily count of unique letters reaching this role dalam 30 hari terakhir
   * - Hitung unique letterInstanceId per hari
   * - Untuk charting volume trends over time
   *
   * **DISTRIBUSI STATUS (Status Distribution):**
   * Breakdown status untuk ALL letters yang pernah mencapai role ini
   * - Count by status: PENDING, IN_PROGRESS, REVISION, COMPLETED, REJECTED
   * - Include both: Letters processed by this role + Letters currently at this role
   * - Digunakan untuk: Pie chart visualization from role's perspective
   *
   * @param letterTypeId - Jenis letter untuk filtering
   * @param roleId - Role ID yang akan dihitung statistiknya
   * @param roleStep - Workflow step number untuk role ini
   * @returns { perluTindakan, selesaiBulanIni, totalBulanIni, trend, distribution }
   */
  static async getStatsForRole(
    letterTypeId: string,
    roleId: string,
    roleStep: number,
  ) {
    console.log("[PROCESSING] Calculate stats for role:", {
      letterTypeId,
      roleId,
      roleStep,
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLast30Days = new Date();
    startOfLast30Days.setDate(now.getDate() - 30);

    console.log("[INFO] Time range:", {
      currentMonth: startOfMonth.toISOString(),
      last30Days: startOfLast30Days.toISOString(),
    });

    // Base where clause - gunakan untuk semua queries
    const baseWhere: any = { letterTypeId, status: { not: "DRAFT" } };

    // SECTION 1: PERLU TINDAKAN
    // Letters yang saat ini di role's step dan need action (PENDING, IN_PROGRESS, REVISION)
    console.log("[PROCESSING] Query PERLU TINDAKAN...");
    const perluTindakanRecords = await db.letterInstance.findMany({
      where: {
        ...baseWhere,
        currentStep: roleStep,
        currentRoleId: roleId,
        OR: [
          { status: "PENDING" },
          { status: "IN_PROGRESS" },
          // Include REVISION jika kembali ke step ini (role review again)
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
    console.log("[SUCCESS] PERLU TINDAKAN:", {
      count: perluTindakan,
      breakdown: {
        total: perluTindakanRecords.length,
      },
    });

    // SECTION 2: SELESAI BULAN INI
    // Unique letters yang processed by this role AND NO LONGER AT THIS ROLE (moved on)
    console.log("[PROCESSING] Query SELESAI BULAN INI...");
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

    // Filter - hanya include letters yang NO LONGER di role ini
    const selesaiBulanIniFiltered = selesaiBulanIniRecords.filter((record) => {
      const letter = record.letterInstance;
      // Exclude jika letter still di role ini
      const isCurrentlyAtThisRole =
        letter.currentRoleId === roleId ||
        (letter.currentStep === roleStep &&
          ["PENDING", "IN_PROGRESS", "REVISION"].includes(
            letter.status as string,
          ));

      return !isCurrentlyAtThisRole;
    });

    const selesaiBulanIni = selesaiBulanIniFiltered.length;
    console.log("[SUCCESS] SELESAI BULAN INI:", {
      count: selesaiBulanIni,
      totalHistoryRecords: selesaiBulanIniRecords.length,
      filtered: selesaiBulanIniFiltered.length,
    });

    // SECTION 3: TOTAL BULAN INI
    // Semua unique letters yang mencapai role ini bulan ini (history + currently at role)
    console.log("[PROCESSING] Query TOTAL BULAN INI...");
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

    // Combine dan deduplicate
    const allLetterIds = new Set([
      ...monthlyHistoryLetters.map((l) => l.letterInstanceId),
      ...monthlyCurrentLetters.map((l) => l.id),
    ]);

    const totalBulanIni = allLetterIds.size;
    console.log("[SUCCESS] TOTAL BULAN INI:", {
      count: totalBulanIni,
      fromHistory: monthlyHistoryLetters.length,
      currentlyAtRole: monthlyCurrentLetters.length,
    });

    // SECTION 4: TREN VOLUME 30 HARI
    // Daily count of unique letters reaching this role dalam 30 hari terakhir
    console.log("[PROCESSING] Query TREN VOLUME...");
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

    // Process trend data - count unique letters per date
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

    console.log("[INFO] TREN VOLUME:", {
      dataPoints: trend.length,
      totalLettersInTrend: trendLetters.length,
    });

    // SECTION 5: DISTRIBUSI STATUS
    // Count letters by status untuk ALL letters yang pernah ke role ini
    console.log("[PROCESSING] Query DISTRIBUSI STATUS...");
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

    // Combine dan deduplicate semua letters yang pernah ke role ini
    const allLetterIdsSet = new Set([
      ...distributionHistoryLetters.map((l) => l.letterInstanceId),
      ...distributionCurrentLetters.map((l) => l.id),
    ]);

    const letterIds = Array.from(allLetterIdsSet);

    // Query status distribution dalam parallel
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

    console.log("[SUCCESS] DISTRIBUSI STATUS:", {
      PENDING: pending,
      IN_PROGRESS: inProgress,
      REVISION: revision,
      COMPLETED: completed,
      REJECTED: rejected,
      total: letterIds.length,
    });

    console.log("[SUCCESS] getStatsForRole completed:", {
      perluTindakan,
      selesaiBulanIni,
      totalBulanIni,
      trendDays: trend.length,
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

  /**
   * [SERVICE] deleteApplication - Soft-delete application dengan ownership check
   *
   * Delete application (soft-delete via deletedAt timestamp):
   * 1. Verify letter exists
   * 2. Verify ownership (createdById == userId)
   * 3. Verify status is DRAFT (only draft applications bisa dihapus)
   * 4. Soft-delete dengan set deletedAt = now
   *
   * Soft Delete Strategy:
   * - Tidak benar-benar delete dari database (keep audit trail)
   * - Set deletedAt timestamp untuk logical deletion
   * - Semua queries exclude deletedAt: null (filter otomatis lebih mudah)
   * - Bisa di-restore kalau perlu (ambil yang punya deletedAt != null)
   *
   * Security:
   * - Hanya creator yang bisa delete (createdById check)
   * - Hanya DRAFT status yang bisa dihapus (prevent accidental deletion dari workflow)
   * - Reject deletion jika submitted ke workflow (status != DRAFT)
   *
   * @param id - Letter instance ID to delete
   * @param userId - Current user ID (ownership verification)
   * @returns Updated letterInstance dengan deletedAt timestamp
   * @throws Error jika not found, unauthorized, atau status != DRAFT
   */
  static async deleteApplication(id: string, userId: string) {
    console.log("[PROCESSING] Delete application:", { id, userId });

    // Verify application exists
    console.log("[INFO] Checking application existence...");
    const application = await db.letterInstance.findUnique({
      where: { id },
    });

    if (!application) {
      console.log("[ERROR] Application not found:", id);
      throw new Error("Application not found");
    }

    // Verify ownership (only creator can delete)
    console.log("[INFO] Verifying ownership:", {
      applicantId: application.createdById,
      requesterId: userId,
    });
    if (application.createdById !== userId) {
      console.log("[ERROR] Unauthorized delete attempt:", {
        applicantId: application.createdById,
        requesterId: userId,
      });
      throw new Error("Unauthorized: Cannot delete this application");
    }

    // Verify status is DRAFT (only draft applications dapat dihapus)
    console.log("[INFO] Checking deletion eligibility:", {
      currentStatus: application.status,
    });
    if (application.status !== "DRAFT") {
      console.log("[ERROR] Cannot delete non-draft application:", {
        id,
        status: application.status,
      });
      throw new Error("Can only delete applications with DRAFT status");
    }

    // Soft delete by setting deletedAt timestamp
    console.log("[PROCESSING] Performing soft delete...");
    const result = await db.letterInstance.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    console.log("[SUCCESS] Application deleted:", {
      id,
      deletedAt: result.deletedAt,
      status: result.status,
    });

    return result;
  }
}
