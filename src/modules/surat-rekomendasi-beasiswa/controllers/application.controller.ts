/**
 * Application Controller - Surat Rekomendasi Beasiswa (SRB) Management
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Controller ini menangani semua operasi untuk surat rekomendasi beasiswa.
 * Termasuk pembuatan, update, approval workflow, signature, dan dokumentasi.
 *
 * Fitur Utama:
 * - createApplication(): Buat aplikasi baru dan submit ke first reviewer
 * - createDraft(): Simpan draft tanpa submit
 * - updateApplication(): Update aplikasi masih dalam status tertentu
 * - listApplications(): Query daftar aplikasi dengan filtering dan pagination
 * - getApplicationDetail(): Ambil detail lengkap aplikasi dengan history
 * - verifyApplication(): Verifikasi dan validasi QR code
 * - getStats(): Statistik aplikasi per role/status
 * - deleteApplication(): Soft delete aplikasi
 * - autoGenerateTemplate(): Generate DOCX template otomatis
 * - saveSignature(): Simpan signature digital di template
 * - studentEditApplication(): Edit aplikasi by mahasiswa (revision)
 * - staffEditApplication(): Edit aplikasi by staff (supervisor/manager)
 *
 * Workflow:
 * DRAFT → PENDING → (REVISION|APPROVED) → READY_FOR_SIGNATURE → (SIGNED|REJECTED) → PUBLISHED
 *
 * Roles yang bisa berinteraksi:
 * - MAHASISWA: Create, submit, self-edit
 * - SUPERVISOR: Review, request revision, approve, sign
 * - MANAJER_TU: Track, verify
 * - WAKIL_DEKAN_1: Final approval
 * - UPA: Publikasi
 */

// [IMPORTS] Import services, database, utilities, dan notification handlers
import { ApplicationService } from "../services/application.service.ts";
import { ROLE_STEP_MAP } from "../constants.ts";
import { Prisma } from "../../../db/index.ts";
import { SuratRekomendasiTemplateService } from "../../../services/template/SuratRekomendasiTemplateService.js";
import { DocumentCleanupService } from "../../../services/DocumentCleanupService.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";
import { writeFileSync } from "fs";
import { join } from "path";
import {
  getQRCodeImageUrl,
  getQRCodeUrl,
} from "../../../services/verification.service.ts";
import {
  notifyApplicationSubmitted,
  notifyApplicationReadyForReview,
  notifyApplicationRejected,
  notifyApplicationRevisionRequested,
  notifyApplicationPublished,
  notifyRevisionToRole,
  notifyApprovalProgress,
  notifyStudentSelfEdit,
  formatRoleName,
} from "../../../services/notification.service.ts";
import { config } from "../../../config.ts";

const db = Prisma;

// [CONTROLLER] Application Controller class - Handle semua endpoint untuk SRB management
export class ApplicationController {
  /**
   * [PRIVATE] validateUserAuth - Helper untuk validasi user authentication
   *
   * Cek apakah user sudah login dan punya valid user ID.
   * Jika tidak valid, set HTTP status 401.
   *
   * @param user - User object dari session
   * @param set - HTTP response setter (dari Elysia)
   * @returns true jika user authenticated, false jika tidak
   */
  private static validateUserAuth(user: any, set: any): boolean {
    if (!user || !user.id) {
      console.log("[ERROR] Authentication Required - No user authentication");
      set.status = 401;
      return false;
    }
    return true;
  }

  /**
   * [HELPER] getApplicationDetailService - Ambil data basic aplikasi tanpa detail lengkap
   *
   * Menggunakan ApplicationService untuk query cepat tanpa fetch semua history/data.
   * Digunakan untuk validasi cepat atau preview data.
   *
   * @param applicationId - ID dari letter instance (aplikasi)
   * @returns Object dengan data dasar aplikasi atau undefined jika tidak ditemukan
   */
  static async getApplicationDetailService(applicationId: string) {
    return await ApplicationService.getApplicationById(applicationId);
  }

  /**
   * [ENDPOINT] createApplication - Buat aplikasi baru dan submit
   *
   * Membuat surat rekomendasi beasiswa baru dan langsung submit ke supervisor.
   * Proses ini:
   * 1. Validasi user authentication
   * 2. Cek jika user sudah ada aplikasi untuk beasiswa yang sama (update instead)
   * 3. Create application dengan status PENDING
   * 4. Notify supervisor akademik untuk review
   * 5. Trigger auto-generate DOCX template async
   *
   * @param body - { namaBeasiswa, values }
   * @param user - User object dari session (mahasiswa)
   * @param set - HTTP response setter
   * @returns { success: boolean, data: application }
   */
  static async createApplication({
    body,
    user,
    set,
  }: {
    body: any;
    user: any;
    set: any;
  }) {
    try {
      // [VALIDATE AUTH] Validasi user sudah login
      if (!ApplicationController.validateUserAuth(user, set)) {
        return {
          error: "Authentication required",
          requiresLogin: true,
        };
      }

      console.log(
        "[PROCESSING] Creating new application for user:",
        user?.email,
      );

      const { namaBeasiswa, values } = body;

      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const letterType = await db.letterType.findUnique({
        where: { id: "srb-type-id" },
      });

      if (!letterType) {
        set.status = 404; // Ubah ke 404 karena merupakan error konfigurasi
        return { error: "LetterType not found." };
      }

      const application = await ApplicationService.createApplication({
        namaBeasiswa,
        values: values || {},
        userId: user.id,
        letterTypeId: letterType.id,
      });

      // Kirim notifikasi ke supervisor saat aplikasi disubmit (PENDING)
      try {
        console.log(
          "[INFO] Starting notification process for application:",
          application.id,
        );

        console.log("[INFO] Querying database for SUPERVISOR users...");
        const supervisors = await db.userRole.findMany({
          where: {
            role: { name: "SUPERVISOR" },
          },
          include: { user: true },
        });

        console.log(
          "[INFO] Query completed. Found supervisors:",
          supervisors.length,
        );

        if (supervisors.length > 0) {
          console.log(
            "[INFO] Supervisor details:",
            supervisors.map((s) => ({
              userId: s.userId,
              email: s.user?.email,
              name: s.user?.name,
            })),
          );
        }

        if (supervisors.length > 0) {
          const supervisorUserIds = supervisors
            .map((ur) => ur.user.id)
            .filter((id) => id !== user.id); // Jangan notifikasi ke pembuat aplikasi

          console.log(
            "[INFO] Supervisor user IDs after filtering (excluding submitter):",
            supervisorUserIds,
          );

          if (supervisorUserIds.length > 0) {
            console.log("[INFO] Sending notifications...");
            try {
              console.log("[INFO] About to call notifyApplicationSubmitted");
              const result = await notifyApplicationSubmitted({
                supervisorUserIds,
                applicationId: application.id,
                scholarshipName: namaBeasiswa,
                applicantName: user.name || "Mahasiswa",
              });
              console.log(
                "[INFO] notifyApplicationSubmitted returned:",
                result?.length,
                "notifications",
              );
              console.log(
                "[SUCCESS] Notifikasi Submit - Success:",
                result?.length,
                "notifications sent",
                result?.map((r) => ({
                  id: r.id,
                  userId: r.userId,
                  type: r.type,
                })),
              );
            } catch (notifyErr) {
              console.error(
                "[ERROR] Exception in notifyApplicationSubmitted:",
                notifyErr instanceof Error
                  ? {
                      message: notifyErr.message,
                      stack: notifyErr.stack,
                    }
                  : notifyErr,
              );
            }
          } else {
            console.log(
              "[INFO] No supervisor user IDs after filtering (all were filtered out)",
            );
          }
        } else {
          console.log(
            "[INFO] No supervisors found in database with role SUPERVISOR",
          );
        }
      } catch (notifyError) {
        console.error(
          "[ERROR] Error in notification block:",
          notifyError instanceof Error
            ? {
                message: notifyError.message,
                stack: notifyError.stack,
              }
            : notifyError,
        );
      }

      set.status = 201;
      console.log("[SUCCESS] Successfully created application:", {
        id: application.id,
        scholarshipName: application.scholarshipName,
        status: application.status,
        createdById: application.createdById,
      });

      // [AUTO GENERATE] AUTO-GENERATE DOCX TEMPLATE ketika aplikasi disubmit
      // Memastikan Word document tersedia untuk preview langsung
      try {
        console.log("[INFO] Triggering auto-generate DOCX template...");
        ApplicationController.autoGenerateTemplate(
          application.id,
          application.id,
        ).catch((err) => {
          console.error("[ERROR] Background template generation failed:", err);
        });
      } catch (genError) {
        console.error(
          "[ERROR] Failed to trigger template generation:",
          genError,
        );
      }

      return {
        success: true,
        data: application,
      };
    } catch (error) {
      console.error("[ERROR] Create application failed:", error);
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Internal server error",
      };
    }
  }

  /**
   * [ENDPOINT] createDraft - Simpan draft aplikasi tanpa submit
   *
   * Membuat atau update draft aplikasi (status DRAFT) tanpa mengirim ke supervisor.
   * User dapat kembali lagi untuk melengkapi dan submit nanti.
   *
   * @param body - { namaBeasiswa, values }
   * @param user - User object dari session (mahasiswa)
   * @param set - HTTP response setter
   * @returns { success: boolean, data: application }
   */
  static async createDraft({
    body,
    user,
    set,
  }: {
    body: any;
    user: any;
    set: any;
  }) {
    try {
      const { namaBeasiswa, values } = body;

      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const letterType = await db.letterType.findUnique({
        where: { id: "srb-type-id" },
      });

      if (!letterType) {
        set.status = 404;
        return { error: "LetterType not found." };
      }

      const application = await ApplicationService.createApplication({
        namaBeasiswa: namaBeasiswa || "Draft Application",
        values: values || {},
        userId: user.id,
        letterTypeId: letterType.id,
        status: "DRAFT",
      });

      set.status = 201;
      return { success: true, data: application };
    } catch (error) {
      console.error("Create draft error:", error);
      set.status = 500;
      return { error: "Failed to create draft" };
    }
  }

  /**
   * [ENDPOINT] updateApplication - Update aplikasi yang masih dalam review
   *
   * Update data aplikasi dalam status tertentu (PENDING, REVISION_REQUESTED).
   * Trigger notification ke supervisor jika ada changes.
   *
   * @param body - { applicationId, namaBeasiswa, values, status }
   * @param user - User object dari session (mahasiswa)
   * @param set - HTTP response setter
   * @returns { success: boolean }
   */
  static async updateApplication({
    params,
    body,
    set,
    user,
  }: {
    params: any;
    body: any;
    set: any;
    user: any;
  }) {
    try {
      const { applicationId } = params;
      const { namaBeasiswa, values, status } = body;

      // Opsional: Validasi kepemilikan aplikasi
      const existing =
        await ApplicationService.getApplicationById(applicationId);
      if (!existing) {
        set.status = 404;
        return { error: "Application not found" };
      }
      if (existing.createdById !== user.id) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      // Validasi apakah ini adalah pengajuan ulang setelah revisi
      const isResubmissionAfterRevision =
        existing.status === "REVISION" && status === "PENDING";

      // Validasi apakah ini pengajuan pertama dari DRAFT ke PENDING
      const isInitialSubmissionFromDraft =
        existing.status === "DRAFT" && status === "PENDING";

      let updateData: any = {
        namaBeasiswa,
        values,
        status,
      };

      // Jika pengajuan ulang setelah revisi atau submit pertama dari draft, selalu kembali ke step 1 (Supervisor Akademik)
      // Ini memastikan alur approval vertikal dari awal
      if (isResubmissionAfterRevision || isInitialSubmissionFromDraft) {
        // Selalu reset ke step 1 (Supervisor Akademik) setelah pengajuan ulang
        const supervisorRole = await db.role.findUnique({
          where: { name: "SUPERVISOR" },
        });

        updateData.status = "PENDING";
        updateData.currentStep = 1;
        updateData.currentRoleId = supervisorRole?.id || null;
      }

      const updated = await ApplicationService.updateApplicationData(
        applicationId,
        updateData,
      );

      // Jika pengajuan ulang setelah revisi atau submit pertama dari draft, buat entry riwayat
      if (isResubmissionAfterRevision || isInitialSubmissionFromDraft) {
        const actionNote = isResubmissionAfterRevision
          ? "Revisi selesai, pengajuan disubmit ulang"
          : "Pengajuan Surat Rekomendasi Beasiswa disubmit";

        const actionType = isResubmissionAfterRevision ? "resubmit" : "submit";

        await db.letterHistory.create({
          data: {
            letterInstanceId: applicationId,
            actorId: user.id,
            action: actionType,
            note: actionNote,
            status: "PENDING",
            roleId: null, // Mahasiswa tidak memiliki roleId
          },
        });

        // Kirim notifikasi ke supervisor
        try {
          const notificationContext = isResubmissionAfterRevision
            ? "resubmission after revision"
            : "initial submission";

          console.log(
            "[INFO] Starting notification process for " +
              notificationContext +
              ":",
            applicationId,
          );

          const supervisors = await db.userRole.findMany({
            where: {
              role: { name: "SUPERVISOR" },
            },
            include: { user: true },
          });

          console.log(
            "[INFO] Found supervisors for notification (" +
              notificationContext +
              "):",
            supervisors.length,
          );

          if (supervisors.length > 0) {
            const supervisorUserIds = supervisors
              .map((ur) => ur.user.id)
              .filter((id) => id !== user.id); // Jangan notifikasi ke pembuat aplikasi

            console.log(
              "[INFO] Supervisor user IDs after filtering:",
              supervisorUserIds,
            );

            if (supervisorUserIds.length > 0) {
              try {
                const result = await notifyApplicationSubmitted({
                  supervisorUserIds,
                  applicationId: applicationId,
                  scholarshipName: namaBeasiswa,
                  applicantName: user.name || "Mahasiswa",
                  isResubmission: isResubmissionAfterRevision,
                });
                console.log(
                  "[SUCCESS] Notification sent to supervisors (" +
                    notificationContext +
                    "):",
                  result?.length,
                  "notifications",
                );
              } catch (notifyErr) {
                console.error(
                  "[ERROR] Exception in notification (" +
                    notificationContext +
                    "):",
                  notifyErr instanceof Error
                    ? {
                        message: notifyErr.message,
                        stack: notifyErr.stack,
                      }
                    : notifyErr,
                );
              }
            }
          }
        } catch (notifyError) {
          console.error(
            "[ERROR] Error in notification block:",
            notifyError instanceof Error
              ? {
                  message: notifyError.message,
                  stack: notifyError.stack,
                }
              : notifyError,
          );
        }

        // [AUTO GENERATE] AUTO-GENERATE DOCX TEMPLATE saat aplikasi disubmit ulang
        // Memastikan Word document tersedia untuk preview langsung
        try {
          console.log("[INFO] Triggering auto-generate DOCX template...");
          ApplicationController.autoGenerateTemplate(
            applicationId,
            applicationId,
          ).catch((err) => {
            console.error(
              "[ERROR] Background template generation failed:",
              err,
            );
          });
        } catch (genError) {
          console.error(
            "[ERROR] Failed to trigger template generation:",
            genError,
          );
        }
      }

      return { success: true, data: updated };
    } catch (error) {
      console.error("Update application error:", error);
      set.status = 500;
      return { error: "Failed to update application" };
    }
  }

  /**
   * [ENDPOINT] listApplications - Query daftar aplikasi dengan filtering
   *
   * Fetch list aplikasi dengan berbagai filter (status, role, beasiswa, dll).
   * Support pagination, search, dan sorting.
   * Results di-filter berdasarkan role dan permissions user.
   *
   * Query parameters:
   * - page: Halaman (default 1)
   * - limit: Items per halaman (default 10)
   * - status: Filter by status (PENDING, APPROVED, PUBLISHED, dll)
   * - role: Filter by role yang handle aplikasi
   * - search: Search by nama beasiswa atau mahasiswa
   * - sort: Sorting field (createdAt, status, dll)
   *
   * @param query - Query parameters dari URL
   * @param user - User object dari session
   * @param set - HTTP response setter
   * @returns { total: number, page: number, limit: number, data: applications[] }
   */
  static async listApplications({
    query,
    set,
    user,
  }: {
    query: any;
    set: any;
    user: any;
  }) {
    try {
      console.log(
        "[PROCESSING] Fetching applications - User:",
        user?.email,
        "Query:",
        query,
      );

      // Validasi null check untuk autentikasi user
      if (!ApplicationController.validateUserAuth(user, set)) {
        return {
          error: "Authentication required",
          requiresLogin: true,
        };
      }

      const {
        status,
        currentStep,
        page,
        limit,
        mode,
        jenisBeasiswa,
        excludeJenisBeasiswa,
        search,
        startDate,
        endDate,
        sortOrder,
      } = query || {};

      // Log parameter tanggal untuk debugging
      console.log("[INFO] Parameter tanggal diterima di controller:", {
        startDate,
        endDate,
        startDateType: typeof startDate,
        endDateType: typeof endDate,
      });

      const filters: any = {
        letterTypeId: "srb-type-id",
        status,
        // Catatan: currentStep dihandle di bawah berdasarkan mode (pending/processed)
        page: page ? Number(page) : undefined,
        sortOrder,
        limit: limit ? Number(limit) : undefined,
        jenisBeasiswa,
        excludeJenisBeasiswa,
        search,
        startDate,
        endDate,
      };

      // Map IN_PROGRESS ke multiple statuses untuk mahasiswa
      if (status === "IN_PROGRESS") {
        filters.status = ["PENDING", "IN_PROGRESS", "REVISION", "REJECTED"];
      }

      if (status === "FINISHED") {
        filters.status = ["COMPLETED", "REJECTED"];
      }

      // FILTERING KETAT BERDASARKAN ROLE
      const userRoles = Array.isArray(user?.roles)
        ? user.roles
        : [user?.role].filter(Boolean);
      const isMahasiswa = userRoles.some(
        (r: string) => r.toUpperCase() === "MAHASISWA",
      );
      const isSuperAdmin = userRoles.some(
        (r: string) => r.toUpperCase() === "SUPER_ADMIN",
      );

      console.log("Role detection:", {
        userRoles,
        isMahasiswa,
        isSuperAdmin,
        userId: user?.id,
      });

      if (status === "DRAFT") {
        // Jika eksplisit meminta draft, tampilkan draft milik user
        // Ini mengabaikan potensi masalah deteksi role untuk "Mahasiswa"
        filters.createdById = user.id;
      } else if (isMahasiswa) {
        filters.createdById = user.id;
        // Untuk Mahasiswa, exclude REJECTED dan COMPLETED dari view IN_PROGRESS
        // Mahasiswa dapat melihat SEMUA aplikasi yang belum final
        // This includes revisions at any stage
        if (status === "IN_PROGRESS") {
          filters.excludeStatus = ["REJECTED", "COMPLETED"];
        }
      } else if (isSuperAdmin) {
        // Super admin melihat SEMUA aplikasi (tanpa role-based filtering)
        // Hanya exclude DRAFTs secara default
        filters.excludeStatus = ["DRAFT"];
        // Tidak ada pembatasan currentRoleId / roleFilterMode — super-admin melihat semuanya
      } else {
        // Untuk reviewer/staff, exclude aplikasi DRAFT
        filters.excludeStatus = ["DRAFT"];

        // Mode: "pending" - Tampilkan aplikasi yang saat ini di step ini menunggu aksi
        // Mode: "processed" - Tampilkan aplikasi yang sudah diproses role ini (berdasarkan history)
        if (mode === "pending" && currentStep) {
          // Aplikasi yang saat ini di step ini dan belum diproses role ini
          filters.currentStep = Number(currentStep);
          filters.currentRoleId = user.roleId;
          filters.roleFilterMode = "pending";
          // Exclude COMPLETED dan REJECTED dari pending list
          filters.excludeStatus = ["DRAFT", "COMPLETED", "REJECTED"];
        } else if (mode === "processed" && currentStep) {
          // Aplikasi yang sudah diproses role ini (berdasarkan history)
          filters.currentRoleId = user.roleId;
          filters.roleFilterMode = "processed";
          // Jangan gunakan processedByStep - kami filter berdasarkan history
        } else if (!mode && user.roleId) {
          // MODE DEFAULT (misalnya Dashboard "Surat Terbaru" - Semua Surat)
          // Tampilkan semua surat yang sudah diproses ATAU saat ini di role ini
          filters.currentRoleId = user.roleId;
          filters.roleFilterMode = "all"; // Tampilkan pending dan processed
        }
      }

      const result = await ApplicationService.listApplications(filters);

      return {
        success: true,
        data: result.items.map((app: any) => {
          const mahasiswa = app.createdBy?.mahasiswa;
          const values = app.values || {};

          // Cari entry revisi terbaru untuk tahu siapa yang minta revisi
          let lastRevisionFromRole: string | undefined = undefined;
          if (
            app.status === "REVISION" &&
            app.history &&
            Array.isArray(app.history)
          ) {
            const revisionHistory = [...app.history]
              .reverse()
              .find((h: any) => h.status === "REVISION");
            if (revisionHistory && revisionHistory.actor?.userRole?.[0]?.role) {
              const rawRoleName = revisionHistory.actor.userRole[0].role.name;
              lastRevisionFromRole = formatRoleName(rawRoleName);
            }
          }

          // Cari actor terakhir yang approve/reject (untuk status COMPLETED/REJECTED)
          let lastActorRole: string | undefined = undefined;
          if (
            (app.status === "COMPLETED" || app.status === "REJECTED") &&
            app.history &&
            Array.isArray(app.history)
          ) {
            // Ambil entry terakhir di history (aksi paling recent)
            const lastHistory = app.history[app.history.length - 1];
            if (lastHistory && lastHistory.role?.name) {
              lastActorRole = formatRoleName(lastHistory.role.name);
            }
          }

          return {
            id: app.id,
            scholarshipName: app.scholarshipName,
            letterType: app.letterType
              ? {
                  id: app.letterType.id,
                  name: app.letterType.name,
                  description: app.letterType.description,
                }
              : undefined,
            status: app.status,
            currentStep: app.currentStep,
            lastRevisionFromRole,
            lastActorRole,
            letterNumber: app.letterNumber,
            applicantName: app.createdBy?.name || "",
            updatedAt: app.updatedAt,
            formData: {
              ...values, // Lapor semua stored form values
              nim: mahasiswa?.nim || (values as any).nim || "",
              departemen:
                mahasiswa?.departemen?.name || (values as any).departemen || "",
              programStudi:
                mahasiswa?.programStudi?.name ||
                (values as any).programStudi ||
                "",
            },
            attachmentsCount: app.attachments.length,
            createdAt: app.createdAt,
          };
        }),
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      };
    } catch (error) {
      console.error("List applications error:", error);
      set.status = 500;
      return { error: "Failed to fetch applications" };
    }
  }

  /**
   * [ENDPOINT] getApplicationOrCreate - Get aplikasi atau create default jika tidak ada
   *
   * Ambil aplikasi yang ada untuk beasiswa tertentu.
   * Jika belum ada, create aplikasi baru dengan status DRAFT otomatis.
   * Berguna untuk form editor yang perlu memastikan ada aplikasi.
   *
   * @param params - { applicationId }
   * @param user - User object dari session (mahasiswa)
   * @param set - HTTP response setter
   * @returns { success: boolean, data: application, isNew: boolean }
   */
  static async getApplicationOrCreate({
    params,
    user,
    set,
  }: {
    params: any;
    user: any;
    set: any;
  }) {
    try {
      const { applicationId } = params;

      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      console.log(
        "[PROCESSING] Fetching or creating application:",
        applicationId,
      );

      // Try to fetch existing application
      let application =
        await ApplicationService.getApplicationById(applicationId);

      if (application) {
        console.log("[SUCCESS] Found existing application:", applicationId);
        // Return existing application
        const mahasiswa = application.createdBy?.mahasiswa;
        const formData = {
          namaLengkap: application.createdBy?.name || "",
          email: application.createdBy?.email || "",
          nim: mahasiswa?.nim || "",
          departemen: mahasiswa?.departemen?.name || "",
          programStudi: mahasiswa?.programStudi?.name || "",
          tempatLahir: mahasiswa?.tempatLahir || "",
          tanggalLahir: mahasiswa?.tanggalLahir || "",
          noHp: mahasiswa?.noHp || "",
          semester: mahasiswa?.semester ? String(mahasiswa.semester) : "",
          ipk: mahasiswa?.ipk ? String(mahasiswa.ipk) : "",
          ips: mahasiswa?.ips ? String(mahasiswa.ips) : "",
          ...(application.values && typeof application.values === "object"
            ? application.values
            : {}),
          namaBeasiswa: application.scholarshipName,
        };

        return {
          success: true,
          data: {
            ...application,
            formData,
            attachments: application.attachments.map((att: any) => ({
              ...att,
              downloadUrl: `/api/surat-rekomendasi/attachments/${att.id}/download`,
            })),
            verification: application.verification
              ? {
                  code: application.verification.code,
                  verifiedCount: application.verification.verifiedCount,
                  qrCodeUrl: getQRCodeImageUrl(
                    application.verification.code,
                    config.FRONTEND_URL,
                  ),
                  verifyLink: getQRCodeUrl(
                    application.verification.code,
                    config.FRONTEND_URL,
                  ),
                }
              : null,
          },
        };
      }

      // Application not found, create new DRAFT
      console.log("[WARNING] Application not found, creating new DRAFT");

      const letterType = await db.letterType.findUnique({
        where: { id: "srb-type-id" },
      });

      if (!letterType) {
        set.status = 404;
        return { error: "LetterType not found" };
      }

      // Create new draft application
      const newApplication = await ApplicationService.createApplication({
        namaBeasiswa: "Surat Rekomendasi Beasiswa",
        values: {},
        userId: user.id,
        letterTypeId: letterType.id,
        status: "DRAFT",
      });

      console.log("[SUCCESS] Created new DRAFT application:", {
        id: newApplication.id,
        createdById: newApplication.createdById,
      });

      // Return new application (minimal data for DRAFT)
      return {
        success: true,
        isNewDraft: true,
        data: {
          id: newApplication.id,
          scholarshipName: newApplication.scholarshipName,
          status: newApplication.status,
          currentStep: newApplication.currentStep,
          createdBy: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          formData: {
            namaLengkap: user.name || "",
            email: user.email || "",
          },
          attachments: [],
          verification: null,
        },
      };
    } catch (error) {
      console.error("Get or create application error:", error);
      set.status = 500;
      return {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch or create application",
      };
    }
  }

  /**
   * [ENDPOINT] getApplicationDetail - Ambil detail lengkap aplikasi with history
   *
   * Fetch detail aplikasi termasuk:
   * - Data lengkap nilai form
   * - History perubahan status dan revisi
   * - Info reviewer/approver
   * - Template document info
   * - QR code untuk verifikasi
   *
   * @param params - { applicationId }
   * @param set - HTTP response setter
   * @returns { success: boolean, data: applicationDetail }
   */
  static async getApplicationDetail({
    params,
    set,
  }: {
    params: any;
    set: any;
  }) {
    try {
      const { applicationId } = params;
      console.log(
        "[PROCESSING] Fetching application detail - ID:",
        applicationId,
      );

      const application =
        await ApplicationService.getApplicationById(applicationId);

      if (!application) {
        console.warn("[WARNING] Application not found:", {
          applicationId,
          message: "Surat tidak ditemukan atau telah dihapus",
        });
        set.status = 404;
        return {
          error:
            "Surat tidak ditemukan atau telah dihapus. Silakan kembali ke daftar surat dan buat yang baru.",
          code: "APPLICATION_NOT_FOUND",
          applicationId,
        };
      }

      const mahasiswa = application.createdBy?.mahasiswa;
      const formData = {
        namaLengkap: application.createdBy?.name || "",
        email: application.createdBy?.email || "",
        nim: mahasiswa?.nim || "",
        departemen: mahasiswa?.departemen?.name || "",
        programStudi: mahasiswa?.programStudi?.name || "",
        tempatLahir: mahasiswa?.tempatLahir || "",
        tanggalLahir: mahasiswa?.tanggalLahir || "",
        noHp: mahasiswa?.noHp || "",
        semester: mahasiswa?.semester ? String(mahasiswa.semester) : "",
        ipk: mahasiswa?.ipk ? String(mahasiswa.ipk) : "",
        ips: mahasiswa?.ips ? String(mahasiswa.ips) : "",
        ...(application.values && typeof application.values === "object"
          ? application.values
          : {}),
        namaBeasiswa: application.scholarshipName,
      };

      // Refresh presigned URLs in values (e.g., wd1_signature) so they don't expire
      const refreshedValues =
        application.values && typeof application.values === "object"
          ? { ...(application.values as Record<string, unknown>) }
          : {};
      if (
        refreshedValues.wd1_signature &&
        typeof refreshedValues.wd1_signature === "string"
      ) {
        try {
          refreshedValues.wd1_signature =
            await MinioService.refreshPresignedUrl(
              refreshedValues.wd1_signature as string,
            );
        } catch (e) {
          console.warn("[WARNING] Failed to refresh wd1_signature URL:", e);
        }
      }

      return {
        success: true,
        data: {
          ...application,
          values: refreshedValues,
          // Refresh stamp URL if present
          stamp: application.stamp
            ? {
                ...application.stamp,
                url: await MinioService.refreshPresignedUrl(
                  application.stamp.url,
                ),
              }
            : null,
          formData,
          attachments: application.attachments.map((att: any) => ({
            ...att,
            downloadUrl: `/api/surat-rekomendasi/attachments/${att.id}/download`,
          })),
          verification: application.verification
            ? {
                code: application.verification.code,
                verifiedCount: application.verification.verifiedCount,
                qrCodeUrl: getQRCodeImageUrl(
                  application.verification.code,
                  config.FRONTEND_URL,
                ),
                verifyLink: getQRCodeUrl(
                  application.verification.code,
                  config.FRONTEND_URL,
                ),
              }
            : null,
        },
      };
    } catch (error) {
      console.error("Get application error:", error);
      set.status = 500;
      return {
        error: "Gagal mengambil data surat. Silakan coba lagi.",
        code: "FETCH_ERROR",
      };
    }
  }

  /**
   * [ENDPOINT] verifyApplication - Verifikasi aplikasi via QR code & manage workflow
   *
   * Endpoint kompleks yang handle:
   * 1. Verifikasi authenticity surat via QR code (public endpoint)
   * 2. Manage approval workflow per role dengan step-based routing
   * 3. Request revision, approve, sign, atau publish aplikasi
   * 4. Track perubahan status dan notifikasi ke role berikutnya
   *
   * Step mapping:
   * - Step 1: SUPERVISOR (review, request revision, approve)
   * - Step 2: MANAJER_TU (verify, track)
   * - Step 3: WAKIL_DEKAN_1 (final approval)
   * - Step 4: UPA (publikasi)
   *
   * @param params - { applicationId }
   * @param body - { action, notes, targetStep, signatureUrl, letterNumber, stampId }
   * @param user - User object dari session (untuk approval workflow)
   * @param set - HTTP response setter
   * @returns { verified: boolean, data: applicationState }
   */
  static async verifyApplication({
    params,
    body,
    set,
    user,
  }: {
    params: any;
    body: any;
    set: any;
    user: any;
  }) {
    try {
      const { applicationId } = params;
      const { action, notes, targetStep, signatureUrl, letterNumber, stampId } =
        body;

      // [STEP ROLE MAP] Definisikan role mappings untuk workflow steps
      // Step 1: Supervisor, Step 2: TU, Step 3: WD1, Step 4: UPA
      const STEP_ROLE_MAP: Record<number, string> = {
        1: "SUPERVISOR",
        2: "MANAJER_TU",
        3: "WAKIL_DEKAN_1",
        4: "UPA",
      };

      const currentApp =
        await ApplicationService.getApplicationById(applicationId);
      if (!currentApp) {
        set.status = 404;
        return { error: "Application not found" };
      }

      // Resolve effective roleId: ketika SUPER_ADMIN bertindak, catat history
      // sebagai role yang own current step (cleaner audit trail)
      const userRoles = Array.isArray(user?.roles)
        ? user.roles
        : [user?.role].filter(Boolean);
      const isSuperAdmin = userRoles.some(
        (r: string) => String(r).toUpperCase() === "SUPER_ADMIN",
      );
      let effectiveRoleId: string | null = user.roleId || null;
      if (isSuperAdmin && currentApp.currentStep) {
        const stepRoleName = STEP_ROLE_MAP[currentApp.currentStep];
        if (stepRoleName) {
          const stepRole = await db.role.findUnique({
            where: { name: stepRoleName },
          });
          if (stepRole) effectiveRoleId = stepRole.id;
        }
      }

      let newStatus = currentApp.status;
      let newStep = currentApp.currentStep ?? 1;
      let nextRoleId: string | undefined = undefined;
      let targetRoleNameForHistory = ""; // Track target role untuk revision history
      // Inisialisasi update values dengan existing values atau empty object
      // Kita perlu cast values ke any untuk allow menambah properties
      let newValues = (currentApp.values as any) || {};

      switch (action) {
        case "approve":
          // Cek Logic berdasarkan Current Step
          if (newStep === 3) {
            // WD1 Approval -> Memerlukan Signature
            if (!signatureUrl) {
              set.status = 400;
              return {
                error: "Signature URL is required for WD1 approval",
              };
            }
            newValues = {
              ...newValues,
              wd1_signature: MinioService.extractObjectKey(signatureUrl),
            };
          } else if (newStep === 4) {
            // UPA Approval -> Memerlukan Nomor Surat (Publish)
            if (!letterNumber) {
              set.status = 400;
              return {
                error: "Letter Number is required for Publishing",
              };
            }
            // Status menjadi COMPLETED
            newStatus = "COMPLETED";
          }

          // Logic Increment
          if (newStep < 4) {
            newStep += 1;
            newStatus = "IN_PROGRESS";
            // Cari nama role berikutnya
            const nextRoleName = STEP_ROLE_MAP[newStep];
            if (nextRoleName) {
              const role = await db.role.findUnique({
                where: { name: nextRoleName },
              });
              if (role) nextRoleId = role.id;
            }
          } else {
            // Sampai ke UPA (Step 4) dan approved -> Selesai
            newStatus = "COMPLETED";
            // Keep current role (UPA) atau clear?
            // Biasanya untuk completed letters, currentRole bisa null atau tidak relevan.
            // Mari clear untuk indicate tidak ada yang "holds" pending action.
            nextRoleId = null as any;
          }
          break;
        case "reject":
          newStatus = "REJECTED";
          nextRoleId = null as any; // Tidak ada yang hold surat yang reject
          break;
        case "revision":
          newStatus = "REVISION";
          if (targetStep !== undefined) {
            newStep = Number(targetStep);

            if (newStep === 0) {
              nextRoleId = undefined; // Null/Undefined = Mahasiswa untuk revisi
              targetRoleNameForHistory = "Mahasiswa";
            } else {
              const targetRoleName = STEP_ROLE_MAP[newStep];
              targetRoleNameForHistory = targetRoleName || "";
              if (targetRoleName) {
                const role = await db.role.findUnique({
                  where: { name: targetRoleName },
                });
                if (role) nextRoleId = role.id;
              }
            }
          } else {
            // Default revision: Kembali 1 step?
            if (newStep > 0) newStep -= 1;
            // Tentukan role logic sama seperti di atas
            if (newStep === 0) {
              nextRoleId = undefined;
              targetRoleNameForHistory = "Mahasiswa";
            } else {
              const targetRoleName = STEP_ROLE_MAP[newStep];
              targetRoleNameForHistory = targetRoleName || "";
              if (targetRoleName) {
                const role = await db.role.findUnique({
                  where: { name: targetRoleName },
                });
                if (role) nextRoleId = role.id;
              }
            }
          }
          break;
        default:
          set.status = 400;
          return { error: "Invalid action" };
      }

      // Siapkan update data
      const updateData: any = {
        status: newStatus,
        currentStep: newStep,
        currentRoleId: nextRoleId,
        values: newValues,
      };

      // Handle explicit null untuk nextRoleId (misalnya Mahasiswa atau Completed/Rejected)
      if (
        nextRoleId === undefined &&
        (newStep === 0 || action === "revision")
      ) {
        updateData.currentRoleId = null;
      }
      if (nextRoleId === null) {
        updateData.currentRoleId = null;
      }

      // Handle PublishedAt jika Completed
      if (newStatus === "COMPLETED") {
        updateData.publishedAt = new Date();
        if (letterNumber) {
          updateData.letterNumber = letterNumber;
        }
        if (stampId) {
          updateData.stampId = stampId;
        }
      }

      const updated = await ApplicationService.updateApplicationStatus(
        applicationId,
        updateData,
        {
          actorId: user.id,
          action: action,
          note:
            action === "revision" && targetRoleNameForHistory
              ? `${notes || ""} [ke ${targetRoleNameForHistory}]`
              : notes,
          roleId: effectiveRoleId, // Use step role for SUPER_ADMIN, own role otherwise
        },
      );

      // [AUTO GENERATE] AUTO-GENERATE WORD TEMPLATE DOCUMENT
      // Ini memastikan Word document selalu tersedia untuk download/preview
      // di setiap stage, mirip seperti HTML preview
      try {
        // Run di background (jangan tunggu completion)
        ApplicationController.autoGenerateTemplate(
          applicationId,
          applicationId,
        ).catch((err) => {
          console.error("[ERROR] Background template generation failed:", err);
        });
      } catch (genError) {
        // Log tapi jangan fail request
        console.error("Failed to trigger template generation:", genError);
      }

      // Trigger notifikasi berdasarkan action
      try {
        const userRoles = Array.isArray(user?.roles)
          ? user.roles
          : [user?.role].filter(Boolean);
        const currentRoleName = userRoles[0] || "Unknown";

        // Map step ke role name untuk notifikasi
        const STEP_ROLE_MAP_NAMES: Record<number, string> = {
          1: "SUPERVISOR",
          2: "MANAJER_TU",
          3: "WAKIL_DEKAN_1",
          4: "UPA",
        };

        switch (action) {
          case "approve": {
            // Notifikasi role berikutnya (jika belum completed)
            if (newStatus === "IN_PROGRESS" && newStep <= 4) {
              const nextRoleName = STEP_ROLE_MAP_NAMES[newStep];
              if (nextRoleName) {
                const nextRoleUsers = await db.userRole.findMany({
                  where: { role: { name: nextRoleName } },
                  include: { user: true },
                });
                if (nextRoleUsers.length > 0) {
                  const nextRoleUserIds = nextRoleUsers.map((ur) => ur.user.id);
                  await notifyApplicationReadyForReview({
                    nextRoleUserIds,
                    applicationId,
                    scholarshipName:
                      currentApp.scholarshipName || "Surat Rekomendasi",
                    applicantName: currentApp.createdBy?.name || "Mahasiswa",
                    currentRoleName,
                    isRevision: false,
                  });
                }
              }

              // Juga notifikasi applicant tentang approval progress
              await notifyApprovalProgress({
                applicantUserId: currentApp.createdById,
                applicationId,
                scholarshipName:
                  currentApp.scholarshipName || "Surat Rekomendasi",
                approvedByRole: currentRoleName,
                nextRole: STEP_ROLE_MAP_NAMES[newStep],
              });
            }
            // Notify applicant if completed (published)
            else if (newStatus === "COMPLETED") {
              await notifyApplicationPublished({
                applicantUserId: currentApp.createdById,
                applicationId,
                scholarshipName:
                  currentApp.scholarshipName || "Surat Rekomendasi",
              });
            }
            break;
          }

          case "reject": {
            // Notify applicant (mahasiswa) about rejection
            await notifyApplicationRejected({
              applicantUserId: currentApp.createdById,
              applicationId,
              scholarshipName:
                currentApp.scholarshipName || "Surat Rekomendasi",
              rejectionReason: notes,
              rejectedByRole: currentRoleName,
            });
            break;
          }

          case "revision": {
            // Handle revision notifications based on target
            if (newStep === 0) {
              // Revision to Mahasiswa (from any role)
              await notifyApplicationRevisionRequested({
                applicantUserId: currentApp.createdById,
                applicationId,
                scholarshipName:
                  currentApp.scholarshipName || "Surat Rekomendasi",
                revisionNotes: notes,
                requestedByRole: currentRoleName,
              });
            } else {
              // Revision to specific role (e.g., WD1 -> TU, WD1 -> SPV, TU -> SPV)
              const targetRoleName = STEP_ROLE_MAP_NAMES[newStep] || "";

              if (targetRoleName) {
                const targetRoleUsers = await db.userRole.findMany({
                  where: {
                    role: { name: targetRoleName },
                  },
                  include: { user: true },
                });

                if (targetRoleUsers.length > 0) {
                  const targetRoleUserIds = targetRoleUsers.map(
                    (ur) => ur.user.id,
                  );

                  // Notify target role about revision task
                  await notifyRevisionToRole({
                    targetUserIds: targetRoleUserIds,
                    applicationId,
                    scholarshipName:
                      currentApp.scholarshipName || "Surat Rekomendasi",
                    applicantName: currentApp.createdBy?.name || "Mahasiswa",
                    requestedByRole: currentRoleName,
                    targetRole: targetRoleName,
                    revisionNotes: notes,
                  });
                }
              }

              // Juga notifikasi applicant tentang revision (agar tahu aplikasi perlu revisi)
              await notifyApplicationRevisionRequested({
                applicantUserId: currentApp.createdById,
                applicationId,
                scholarshipName:
                  currentApp.scholarshipName || "Surat Rekomendasi",
                revisionNotes: notes,
                requestedByRole: currentRoleName,
              });
            }
            break;
          }
        }
      } catch (notifyError) {
        console.error(
          "[ERROR] Failed to send notification in verifyApplication:",
          {
            error:
              notifyError instanceof Error ? notifyError.message : notifyError,
            action,
            applicationId,
          },
        );
        // Don't fail the request if notification fails
      }

      // [AUTO GENERATE] Trigger Auto-Generation untuk ensure PDF reflects status/signature/number
      try {
        console.log(`[INFO] Triggering auto-generate for ${applicationId}`);

        // [AUTO GENERATE] Trigger Auto-Generation untuk ensure PDF reflects status/signature/number
        // For publish events, kita akan do extra cleanup after generation
        console.log(`[INFO] Triggering auto-generate for ${applicationId}`);

        // Call static method within same class - wait for completion if publishing
        if (newStatus === "COMPLETED") {
          // For publish, we wait for template generation to complete then do extra cleanup
          try {
            await ApplicationController.autoGenerateTemplate(
              applicationId,
              applicationId,
            );
            // Extra cleanup after publish to ensure only final files remain
            console.log(
              `🧹 [verifyApplication] Extra cleanup after publish for: ${applicationId}`,
            );
            await DocumentCleanupService.cleanupKeepLatest(applicationId);
            await DocumentCleanupService.cleanupTempFiles();
          } catch (err) {
            console.error(
              "[ERROR] Template generation failed during publish:",
              err,
            );
          }
        } else {
          // For non-publish actions, generate in background as before
          ApplicationController.autoGenerateTemplate(
            applicationId,
            applicationId,
          ).catch((err) => {
            console.error(
              "[ERROR] Background template generation failed:",
              err,
            );
          });
        }
      } catch (genError) {
        console.error("[ERROR] Failed to initiate generation:", genError);
      }

      return { success: true, data: updated };
    } catch (error) {
      console.error("Verify application error:", error);
      set.status = 500;
      return { error: "Verification failed" };
    }
  }

  /**
   * [ENDPOINT] getStats - Statistik aplikasi per role/status
   *
   * Fetch statistik agregat untuk dashboard.
   * Menampilkan total aplikasi per status, per role, conversion rates, dll.
   * Stats berbeda untuk mahasiswa (filter by createdById) vs staff (filter by roleStep).
   *
   * @param query - { period: 'today'|'week'|'month'|'year' }
   * @param user - User object dari session
   * @param set - HTTP response setter
   * @returns { stats: { total, byStatus, byRole, ... } }
   */
  static async getStats({
    set,
    user,
    query,
  }: {
    set: any;
    user: any;
    query: any;
  }) {
    try {
      console.log("[PROCESSING] Fetching statistics - User:", user?.email);
      const userRoles = Array.isArray(user?.roles)
        ? user.roles
        : [user?.role].filter(Boolean);
      const isMahasiswa = userRoles.some(
        (r: string) => r.toUpperCase() === "MAHASISWA",
      );

      // For Mahasiswa: use original stats logic (filter by createdById)
      if (isMahasiswa) {
        const filters: any = { createdById: user.id };

        const stats = await ApplicationService.getStats("srb-type-id", filters);
        return { success: true, data: stats };
      }

      // For Role (SPV, TU, WD1, UPA): use new role-based stats logic
      if (user.roleId) {
        const roleName = userRoles[0];
        const roleStep = ROLE_STEP_MAP[roleName];

        if (roleStep) {
          const stats = await ApplicationService.getStatsForRole(
            "srb-type-id",
            user.roleId,
            roleStep,
          );
          return { success: true, data: stats };
        }
      }

      // Fallback: return empty stats
      return {
        success: true,
        data: {
          perluTindakan: 0,
          selesaiBulanIni: 0,
          totalBulanIni: 0,
          trend: [],
          distribution: {
            pending: 0,
            inProgress: 0,
            completed: 0,
            rejected: 0,
          },
        },
      };
    } catch (error) {
      console.error("Get stats error:", error);
      set.status = 500;
      return { error: "Failed to fetch statistics" };
    }
  }

  /**
   * [ENDPOINT] deleteApplication - Soft delete aplikasi
   *
   * Soft delete aplikasi (tidak remove dari DB, hanya mark as deleted).
   * Hanya bisa delete aplikasi dengan status DRAFT atau yang milik user sendiri.
   *
   * @param params - { applicationId }
   * @param user - User object dari session (mahasiswa)
   * @param set - HTTP response setter
   * @returns { success: boolean }
   */
  static async deleteApplication({
    params,
    user,
    set,
  }: {
    params: any;
    user: any;
    set: any;
  }) {
    try {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { applicationId } = params;
      console.log(
        "[PROCESSING] Deleting application - ID:",
        applicationId,
        "User:",
        user?.id,
      );

      const result = await ApplicationService.deleteApplication(
        applicationId,
        user.id,
      );

      return {
        success: true,
        message: "Draft deleted successfully",
        data: result,
      };
    } catch (error: any) {
      console.error("[ERROR] Delete application failed:", error);

      if (error.message === "Application not found") {
        set.status = 404;
        return { error: "Application not found" };
      }

      if (
        error.message.includes("Unauthorized") ||
        error.message.includes("Cannot delete")
      ) {
        set.status = 403;
        return { error: error.message };
      }

      if (error.message.includes("only delete")) {
        set.status = 400;
        return { error: error.message };
      }

      set.status = 500;
      return { error: "Failed to delete application" };
    }
  }

  /**
   * [FUNCTION] autoGenerateTemplate - Generate DOCX template otomatis
   *
   * Generate dokumen Word dari template dengan data aplikasi.
   * Proses ini:
   * 1. Load template DOCX
   * 2. Replace placeholder dengan data aplikasi
   * 3. Add QR code untuk verifikasi
   * 4. Upload ke MinIO object storage
   * 5. Save URL ke database
   *
   * Dipanggil setelah setiap action verification/approval dan saat student submit.
   * Bisa dijalankan async (tidak block response).
   *
   * @param letterInstanceId - ID dari aplikasi
   * @param applicationId - ID dari aplikasi (sama dengan letterInstanceId)
   * @param letterTypeId - ID dari tipe surat (default: srb-type-id)
   * @returns Promise<void>
   */
  static async autoGenerateTemplate(
    letterInstanceId: string,
    applicationId: string,
    letterTypeId: string = "srb-type-id",
  ): Promise<void> {
    try {
      console.log(
        `[INFO] Starting DOCX template generation for: ${letterInstanceId}`,
      );

      // Get latest generation log if exists
      const existingLog = await db.documentGenerationLog.findFirst({
        where: { letterInstanceId },
        orderBy: { generatedAt: "desc" },
      });

      // Get letter instance with all needed data
      const letterInstance = await db.letterInstance.findUnique({
        where: { id: letterInstanceId },
        include: {
          createdBy: {
            include: {
              mahasiswa: {
                include: {
                  departemen: true,
                  programStudi: true,
                },
              },
              pegawai: true,
            },
          },
          stamp: true,
        },
      });

      if (!letterInstance) {
        console.warn(
          `[WARNING] Letter instance not found: ${letterInstanceId}`,
        );
        return;
      }

      // Get template
      const template = await db.documentTemplate.findFirst({
        where: {
          isActive: true,
          letterTypeId,
        },
      });

      if (!template) {
        console.warn(`[WARNING] Template not found for type: ${letterTypeId}`);
        return;
      }

      // Get leadership config (WAKIL_DEKAN_1)
      const leadershipConfig = await db.letterConfig.findUnique({
        where: { key: "WAKIL_DEKAN_1" },
      });

      // Get WD1 signature - this should be from Wakil Dekan 1's signature, not the applicant
      // Check if WD1 has signed (currentStep >= 4 means WD1 has approved)
      let signatureUrl = undefined;
      const letterValues = (letterInstance.values as any) || {};

      // Check if WD1 signature is stored in values (added during WD1 approval)
      if (letterValues.wd1_signature) {
        try {
          signatureUrl = await MinioService.refreshPresignedUrl(
            letterValues.wd1_signature,
          );
          console.log(
            `[SUCCESS] WD1 signature found in values: ${signatureUrl}`,
          );
        } catch (err) {
          console.warn(
            `[WARNING] Failed to refresh WD1 signature URL, using raw:`,
            err instanceof Error ? err.message : err,
          );
          signatureUrl = letterValues.wd1_signature;
        }
      } else if (
        letterInstance.currentStep &&
        letterInstance.currentStep >= 4
      ) {
        // If we're at step 4+ but no signature in values, try to get from WD1 user
        // Find users with WAKIL_DEKAN_1 role
        try {
          const wd1Users = await db.userRole.findMany({
            where: { role: { name: "WAKIL_DEKAN_1" } },
            include: { user: true },
          });

          if (wd1Users.length > 0) {
            const firstWd1User = wd1Users[0];
            if (firstWd1User) {
              const wd1Signature = await db.userSignature.findFirst({
                where: {
                  userId: firstWd1User.userId,
                  isDefault: true,
                },
                orderBy: { createdAt: "desc" },
              });

              if (wd1Signature) {
                try {
                  signatureUrl = await MinioService.refreshPresignedUrl(
                    wd1Signature.url,
                  );
                } catch {
                  signatureUrl = wd1Signature.url;
                }
                console.log(
                  `[SUCCESS] WD1 signature from user: ${signatureUrl}`,
                );
              }
            }
          }
        } catch (err) {
          console.warn(
            `[WARNING] Failed to get WD1 user signature:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      // Get stamp URL from letterInstance
      let stampUrl = undefined;
      if (letterInstance.stamp) {
        try {
          stampUrl = await MinioService.refreshPresignedUrl(
            letterInstance.stamp.url,
          );
          console.log(`[SUCCESS] Stamp found: ${stampUrl}`);
        } catch (err) {
          console.warn(
            `⚠️ [autoGenerateTemplate] Failed to refresh stamp URL, using raw:`,
            err instanceof Error ? err.message : err,
          );
          stampUrl = letterInstance.stamp.url;
        }
      }

      // Prepare template data
      // Use same merging strategy as getApplicationDetail:
      // 1. Base: mahasiswa data from DB (LIVE data)
      // 2. Spread letterValues ON TOP (so user form input overrides DB data)
      // 3. Fixed overrides that should always come from specific sources
      const mahasiswa = letterInstance.createdBy?.mahasiswa;
      const templateData = {
        letterInstanceId: letterInstance.id,
        applicationData: {
          // 1. Base: mahasiswa data from database (LIVE)
          namaLengkap: letterInstance.createdBy?.name || "",
          email: letterInstance.createdBy?.email || "",
          nim: mahasiswa?.nim || "",
          departemen: mahasiswa?.departemen?.name || "",
          programStudi: mahasiswa?.programStudi?.name || "",
          tempatLahir: mahasiswa?.tempatLahir || "",
          tanggalLahir: mahasiswa?.tanggalLahir || "",
          noHp: mahasiswa?.noHp || "",
          semester: mahasiswa?.semester ? String(mahasiswa.semester) : "",
          ipk: mahasiswa?.ipk ? String(mahasiswa.ipk) : "",
          ips: mahasiswa?.ips ? String(mahasiswa.ips) : "",

          // 2. Spread letterValues ON TOP - user form overrides take precedence
          ...letterValues,

          // 3. Fixed overrides that MUST come from specific sources
          namaBeasiswa: letterInstance.scholarshipName,
        },
        letterNumber: letterInstance.letterNumber || undefined,
        signatureUrl: signatureUrl,
        stampUrl: stampUrl,
        publishedAt: letterInstance.publishedAt || undefined,
        jenis: letterValues.jenisBeasiswa || undefined,
        leadershipConfig: leadershipConfig
          ? {
              name: (leadershipConfig.value as any)?.name || "",
              nip: (leadershipConfig.value as any)?.nip || "",
              jabatan: (leadershipConfig.value as any)?.jabatan || "",
            }
          : undefined,
      };

      // Initialize template service
      const templateService = new SuratRekomendasiTemplateService();

      // Generate document
      const documentBuffer =
        await templateService.generateSuratRekomendasi(templateData);

      // Create new generation log entry (replace old one if exists)
      const filename = `surat-rekomendasi-${letterInstance.id}-${Date.now()}.docx`;
      const filePath = join("uploads", "generated", filename);

      // Ensure directory exists
      const fs = require("fs");
      const uploadDir = join(process.cwd(), "uploads", "generated");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // 🧹 Cleanup old documents before creating new ones
      console.log(
        `🧹 [autoGenerateTemplate] Cleaning up old documents for: ${letterInstanceId}`,
      );
      await DocumentCleanupService.cleanupOldDocuments(letterInstanceId);

      // Write new file
      writeFileSync(join(process.cwd(), filePath), documentBuffer);

      // Create new generation log
      await db.documentGenerationLog.create({
        data: {
          templateId: template.id,
          letterInstanceId: letterInstance.id,
          generatedFormat: "DOCX",
          status: "SUCCESS",
          filePath,
          fileSize: documentBuffer.length,
          processingTimeMs: 0,
        },
      });

      console.log(
        `✅ [autoGenerateTemplate] Document generated: ${letterInstanceId}`,
      );
    } catch (error) {
      console.error(
        `[ERROR] Failed to generate template for ${letterInstanceId}:`,
        error instanceof Error ? error.message : error,
      );
      // Don't throw - this is a background operation
    }
  }

  /**
   * [ENDPOINT] saveSignature - Simpan signature digital ke template
   *
   * Simpan digital signature dari supervisor/approver ke DOCX template.
   * Signature akan embedded di dokumen dan visible di file.
   *
   * @param params - { applicationId }
   * @param body - { signatureUrl: base64DataUrl }
   * @param set - HTTP response setter
   * @returns { success: boolean }
   */
  static async saveSignature({
    params,
    body,
    set,
  }: {
    params: any;
    body: any;
    set: any;
  }) {
    try {
      const { applicationId } = params;
      const { signatureUrl } = body;

      if (!signatureUrl) {
        set.status = 400;
        return { error: "Signature URL is required" };
      }

      // [FETCH] Get current application untuk preserve existing values
      const application =
        await ApplicationService.getApplicationById(applicationId);

      if (!application) {
        set.status = 404;
        return { error: "Application not found" };
      }

      // [SIGNATURE STORAGE] Update application values dengan WD1 signature
      // Store sebagai object path (bukan presigned URL) untuk persistence
      const currentValues = (application.values as any) || {};
      const signatureObjectKey = MinioService.extractObjectKey(signatureUrl);
      const updatedValues = {
        ...currentValues,
        wd1_signature: signatureObjectKey,
      };

      await db.letterInstance.update({
        where: { id: applicationId },
        data: {
          values: updatedValues,
        },
      });

      // Trigger auto-generation immediately
      console.log(
        `📄 [saveSignature] Triggering auto-generate for ${applicationId}`,
      );
      try {
        await ApplicationController.autoGenerateTemplate(
          applicationId,
          applicationId,
        );
      } catch (genError) {
        console.error(
          "❌ [saveSignature] Template generation failed:",
          genError,
        );
      }

      return { success: true };
    } catch (error) {
      console.error("Save signature error:", error);
      set.status = 500;
      return { error: "Failed to save signature" };
    }
  }

  /**
   * [ENDPOINT] studentEditApplication - Edit aplikasi by mahasiswa (revision)
   *
   * Allows mahasiswa untuk edit aplikasi yang dalam status REVISION_REQUESTED.
   * Juga bisa self-edit sebelum supervisor pertama take action (PENDING di step 1).
   *
   * Perubahan akan dicatat di history dengan action="student_revision" sehingga
   * semua roles bisa lihat di letter history ketika aplikasi progress melalui workflow.
   *
   * @param params - { applicationId }
   * @param body - { namaBeasiswa, values, catatan }
   * @param user - User object dari session (mahasiswa)
   * @param set - HTTP response setter
   * @returns { success: boolean }
   */
  static async studentEditApplication({
    params,
    body,
    set,
    user,
  }: {
    params: any;
    body: any;
    set: any;
    user: any;
  }) {
    try {
      const { applicationId } = params;
      const { namaBeasiswa, values, catatan } = body;

      if (!ApplicationController.validateUserAuth(user, set)) {
        return {
          error: "Authentication required",
          requiresLogin: true,
        };
      }

      const existing =
        await ApplicationService.getApplicationById(applicationId);
      if (!existing) {
        set.status = 404;
        return { error: "Application not found" };
      }
      if (existing.createdById !== user.id) {
        set.status = 403;
        return { error: "Forbidden: You do not own this application" };
      }

      // [VALIDATION] Only allow jika status PENDING dan di step 1 (Supervisor belum act)
      if (existing.status !== "PENDING" || existing.currentStep !== 1) {
        set.status = 422;
        return {
          error:
            "Tidak dapat mengedit: surat sudah mendapat tindakan dari Supervisor Akademik atau bukan dalam status PENDING.",
        };
      }

      // Juga verifikasi tidak ada Supervisor history entry yang ada
      const supervisorRole = await db.role.findUnique({
        where: { name: "SUPERVISOR" },
      });
      if (supervisorRole) {
        const supervisorHistory = await db.letterHistory.findFirst({
          where: {
            letterInstanceId: applicationId,
            roleId: supervisorRole.id,
          },
        });
        if (supervisorHistory) {
          set.status = 422;
          return {
            error:
              "Tidak dapat mengedit: Supervisor Akademik sudah melakukan tindakan pada surat ini.",
          };
        }
      }

      // Update letter data while keeping status=PENDING/step=1/currentRoleId=supervisor
      await ApplicationService.updateApplicationData(applicationId, {
        namaBeasiswa: namaBeasiswa,
        values: values,
        status: "PENDING",
        currentStep: 1,
        currentRoleId: supervisorRole?.id || existing.currentRoleId,
      });

      // Create history entry for student self-revision
      const historyNote = catatan
        ? `Revisi Mandiri oleh Mahasiswa: ${catatan}`
        : "Revisi Mandiri oleh Mahasiswa sebelum tindakan Supervisor Akademik";

      await db.letterHistory.create({
        data: {
          letterInstanceId: applicationId,
          actorId: user.id,
          action: "student_revision",
          note: historyNote,
          status: "PENDING",
          roleId: null, // Mahasiswa has no roleId
        },
      });

      // Notify supervisors about the student's self-edit
      try {
        const supervisors = await db.userRole.findMany({
          where: { role: { name: "SUPERVISOR" } },
          include: { user: true },
        });
        const supervisorUserIds = supervisors
          .map((ur) => ur.user.id)
          .filter((id) => id !== user.id);

        if (supervisorUserIds.length > 0) {
          await notifyStudentSelfEdit({
            supervisorUserIds,
            applicationId,
            scholarshipName: namaBeasiswa || existing.scholarshipName || "",
            applicantName: user.name || "Mahasiswa",
          });
          console.log(
            `🔔 [studentEditApplication] Notified ${supervisorUserIds.length} supervisors`,
          );
        }
      } catch (notifyError) {
        console.error(
          "❌ [studentEditApplication] Notification error:",
          notifyError,
        );
      }

      // Auto-regenerate template
      try {
        ApplicationController.autoGenerateTemplate(
          applicationId,
          applicationId,
        ).catch((err) =>
          console.error(
            "❌ [studentEditApplication] Template regen failed:",
            err,
          ),
        );
      } catch (genError) {
        console.error(
          "❌ [studentEditApplication] Failed to trigger template generation:",
          genError,
        );
      }

      return {
        success: true,
        message: "Surat berhasil direvisi.",
      };
    } catch (error) {
      console.error("studentEditApplication error:", error);
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Internal server error",
      };
    }
  }

  /**
   * [ENDPOINT] staffEditApplication - Edit aplikasi by staff (supervisor/manager)
   *
   * Allows supervisor/manajer TU untuk edit data aplikasi dalam review.
   * Edit ini tidak bisa mengubah status/step, hanya data values saja.
   * Perubahan dicatat di history dengan action="staff_revision"
   * sehingga aplikasi tetap di queue mereka pada step/status yang sama.\n     *
   * @param params - { applicationId }
   * @param body - { namaBeasiswa, values, catatan }
   * @param user - User object dari session (supervisor/manager)
   * @param set - HTTP response setter
   * @returns { success: boolean }
   */
  static async staffEditApplication({
    params,
    body,
    set,
    user,
  }: {
    params: any;
    body: any;
    set: any;
    user: any;
  }) {
    try {
      const { applicationId } = params;
      const { namaBeasiswa, values, catatan } = body;

      if (!ApplicationController.validateUserAuth(user, set)) {
        return {
          error: "Authentication required",
          requiresLogin: true,
        };
      }

      // [ROLE CHECK] Determine allowed roles dan step mereka
      const userRoles: string[] = Array.isArray(user.roles)
        ? user.roles
        : [user.role].filter(Boolean);
      const isSupervisor = userRoles.some(
        (r: string) => r.toUpperCase() === "SUPERVISOR",
      );
      const isManajerTU = userRoles.some(
        (r: string) => r.toUpperCase() === "MANAJER_TU",
      );

      if (!isSupervisor && !isManajerTU) {
        set.status = 403;
        return {
          error:
            "Forbidden: Only Supervisor Akademik or Manajer TU can perform this action.",
        };
      }

      const expectedStep = isSupervisor ? 1 : 2;

      const existing =
        await ApplicationService.getApplicationById(applicationId);
      if (!existing) {
        set.status = 404;
        return { error: "Application not found" };
      }

      // Must be at the correct step for this role
      if (existing.currentStep !== expectedStep) {
        set.status = 422;
        return {
          error: `Tidak dapat mengedit: surat tidak berada di tahap ${isSupervisor ? "Supervisor Akademik" : "Manajer TU"}.`,
        };
      }

      // Must not be in a terminal state
      if (existing.status === "COMPLETED" || existing.status === "REJECTED") {
        set.status = 422;
        return {
          error: "Tidak dapat mengedit: surat sudah selesai atau ditolak.",
        };
      }

      // Merge updated values with existing values
      const currentValues = (existing.values as any) || {};
      const mergedValues = values
        ? { ...currentValues, ...values }
        : currentValues;

      // Update data fields without changing status/step/role
      await db.letterInstance.update({
        where: { id: applicationId },
        data: {
          scholarshipName:
            namaBeasiswa !== undefined
              ? namaBeasiswa
              : existing.scholarshipName,
          values: mergedValues,
        },
      });

      // Create staff revision history entry
      const roleName = isSupervisor ? "Supervisor Akademik" : "Manajer TU";
      const historyNote = catatan
        ? `Edit data surat oleh ${roleName}: ${catatan}`
        : `Data surat diperbarui oleh ${roleName}`;

      await db.letterHistory.create({
        data: {
          letterInstanceId: applicationId,
          actorId: user.id,
          action: "staff_revision",
          note: historyNote,
          status: existing.status as any,
          roleId: user.roleId || null,
        },
      });

      // [AUTO GENERATE] Auto-regenerate template setelah edit
      try {
        ApplicationController.autoGenerateTemplate(
          applicationId,
          applicationId,
        ).catch((err) =>
          console.error("[ERROR] Template regeneration failed:", err),
        );
      } catch (genError) {
        console.error(
          "[ERROR] Failed to trigger template regeneration:",
          genError,
        );
      }

      return {
        success: true,
        message: "Data surat berhasil diperbarui.",
      };
    } catch (error) {
      console.error("[ERROR] staffEditApplication failed:", error);
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Internal server error",
      };
    }
  }
}
