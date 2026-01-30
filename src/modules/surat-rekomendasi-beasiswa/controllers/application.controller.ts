import { ApplicationService } from "../services/application.service.ts";
import { ROLE_STEP_MAP } from "../constants.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";
import { Prisma } from "../../../db/index.ts";
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
} from "../../../services/notification.service.ts";

const db = Prisma;

export class ApplicationController {
    /**
     * Helper method to convert database role name to user-friendly format
     */
    static formatRoleName(roleName: string): string {
        const roleMap: Record<string, string> = {
            SUPERVISOR: "Supervisor Akademik",
            MANAJER_TU: "Manajer TU",
            WAKIL_DEKAN_1: "Wakil Dekan 1",
            UPA: "Staff UPA",
            MAHASISWA: "Mahasiswa",
        };
        return roleMap[roleName] || roleName;
    }

    /**
     * Helper method to get basic application info without full details
     */
    static async getApplicationDetailService(applicationId: string) {
        return await ApplicationService.getApplicationById(applicationId);
    }

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
            console.log(
                "🚀 [createApplication] Started with user:",
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
                set.status = 404; // Changed to 404 as it is configuration error
                return { error: "LetterType not found." };
            }

            const application = await ApplicationService.createApplication({
                namaBeasiswa,
                values: values || {},
                userId: user.id,
                letterTypeId: letterType.id,
            });

            // Trigger notification to supervisors when application is submitted (PENDING)
            try {
                console.log(
                    "🔔 Starting notification process for application:",
                    application.id,
                );

                console.log("🔔 Querying database for SUPERVISOR users...");
                const supervisors = await db.userRole.findMany({
                    where: {
                        role: { name: "SUPERVISOR" },
                    },
                    include: { user: true },
                });

                console.log(
                    "🔔 Query completed. Found supervisors:",
                    supervisors.length,
                );

                if (supervisors.length > 0) {
                    console.log(
                        "🔔 Supervisor details:",
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
                        .filter((id) => id !== user.id); // Don't notify the submitter

                    console.log(
                        "🔔 Supervisor user IDs after filtering (excluding submitter):",
                        supervisorUserIds,
                    );

                    if (supervisorUserIds.length > 0) {
                        console.log("🔔 Sending notifications...");
                        try {
                            console.log(
                                "🔔 About to call notifyApplicationSubmitted",
                            );
                            const result = await notifyApplicationSubmitted({
                                supervisorUserIds,
                                applicationId: application.id,
                                scholarshipName: namaBeasiswa,
                                applicantName: user.name || "Mahasiswa",
                            });
                            console.log(
                                "🔔 notifyApplicationSubmitted returned:",
                                result?.length,
                                "notifications",
                            );
                            console.log(
                                "🔔 Notifikasi Submit - Success:",
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
                                "❌ Exception in notifyApplicationSubmitted:",
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
                            "🔔 No supervisor user IDs after filtering (all were filtered out)",
                        );
                    }
                } else {
                    console.log(
                        "🔔 No supervisors found in database with role SUPERVISOR",
                    );
                }
            } catch (notifyError) {
                console.error(
                    "❌ Error in notification block:",
                    notifyError instanceof Error
                        ? {
                              message: notifyError.message,
                              stack: notifyError.stack,
                          }
                        : notifyError,
                );
            }

            set.status = 201;
            console.log(
                "✅ [createApplication] Successfully created application:",
                {
                    id: application.id,
                    scholarshipName: application.scholarshipName,
                    status: application.status,
                    createdById: application.createdById,
                },
            );
            return {
                success: true,
                data: application,
            };
        } catch (error) {
            console.error("Create application error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
            };
        }
    }

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

            // Optional: Check ownership
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

            // Check if this is a resubmission after revision
            const isResubmissionAfterRevision =
                existing.status === "REVISION" && status === "PENDING";

            // Check if this is initial submission from DRAFT to PENDING
            const isInitialSubmissionFromDraft =
                existing.status === "DRAFT" && status === "PENDING";

            let updateData: any = {
                namaBeasiswa,
                values,
                status,
            };

            // If resubmitting after revision or initial submit from draft, always go back to step 1 (Supervisor Akademik)
            // This ensures vertical approval flow from the beginning
            if (isResubmissionAfterRevision || isInitialSubmissionFromDraft) {
                // Always reset to step 1 (Supervisor Akademik) after resubmission
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

            // If resubmission after revision or initial submit from draft, create history entry
            if (isResubmissionAfterRevision || isInitialSubmissionFromDraft) {
                const actionNote = isResubmissionAfterRevision
                    ? "Revisi selesai, pengajuan disubmit ulang ke Supervisor Akademik"
                    : "Pengajuan Surat Rekomendasi Beasiswa disubmit ke Supervisor Akademik";

                const actionType = isResubmissionAfterRevision
                    ? "resubmit"
                    : "submit";

                await db.letterHistory.create({
                    data: {
                        letterInstanceId: applicationId,
                        actorId: user.id,
                        action: actionType,
                        note: actionNote,
                        status: "PENDING",
                        roleId: null, // Mahasiswa doesn't have roleId
                    },
                });

                // Trigger notification to supervisors
                try {
                    const notificationContext = isResubmissionAfterRevision
                        ? "resubmission after revision"
                        : "initial submission";

                    console.log(
                        "🔔 Starting notification process for " +
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
                        "🔔 Found supervisors for notification (" +
                            notificationContext +
                            "):",
                        supervisors.length,
                    );

                    if (supervisors.length > 0) {
                        const supervisorUserIds = supervisors
                            .map((ur) => ur.user.id)
                            .filter((id) => id !== user.id); // Don't notify the submitter

                        console.log(
                            "🔔 Supervisor user IDs after filtering:",
                            supervisorUserIds,
                        );

                        if (supervisorUserIds.length > 0) {
                            try {
                                const result = await notifyApplicationSubmitted(
                                    {
                                        supervisorUserIds,
                                        applicationId: applicationId,
                                        scholarshipName: namaBeasiswa,
                                        applicantName: user.name || "Mahasiswa",
                                    },
                                );
                                console.log(
                                    "🔔 Notification sent to supervisors (" +
                                        notificationContext +
                                        "):",
                                    result?.length,
                                    "notifications",
                                );
                            } catch (notifyErr) {
                                console.error(
                                    "❌ Exception in notification (" +
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
                        "❌ Error in notification block:",
                        notifyError instanceof Error
                            ? {
                                  message: notifyError.message,
                                  stack: notifyError.stack,
                              }
                            : notifyError,
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
            console.log("ListApplications Request:", {
                user: {
                    id: user?.id,
                    email: user?.email,
                    role: user?.role,
                    roles: user?.roles,
                },
                query,
            });
            const {
                status,
                currentStep,
                page,
                limit,
                mode,
                jenisBeasiswa,
                search,
                startDate,
                endDate,
                sortOrder,
            } = query || {};

            const filters: any = {
                letterTypeId: "srb-type-id",
                status,
                // Note: currentStep is handled below based on mode (pending/processed)
                page: page ? Number(page) : undefined,
                sortOrder,
                limit: limit ? Number(limit) : undefined,
                jenisBeasiswa,
                search,
                startDate,
                endDate,
            };

            // Map IN_PROGRESS to multiple statuses for students
            if (status === "IN_PROGRESS") {
                filters.status = [
                    "PENDING",
                    "IN_PROGRESS",
                    "REVISION",
                    "REJECTED",
                ];
            }

            if (status === "FINISHED") {
                filters.status = ["COMPLETED", "REJECTED"];
            }

            // STRICT FILTERING BASED ON ROLE
            const userRoles = Array.isArray(user?.roles)
                ? user.roles
                : [user?.role].filter(Boolean);
            const isMahasiswa = userRoles.some(
                (r: string) => r.toUpperCase() === "MAHASISWA",
            );

            console.log("Role detection:", {
                userRoles,
                isMahasiswa,
                userId: user?.id,
            });

            if (status === "DRAFT") {
                // If explicitly asking for drafts, show user's own drafts
                // This bypasses potential role detection issues for "Mahasiswa"
                filters.createdById = user.id;
            } else if (isMahasiswa) {
                filters.createdById = user.id;
                // For Mahasiswa, exclude REJECTED and COMPLETED from IN_PROGRESS view
                // Mahasiswa can see ALL applications that are not yet final
                // This includes revisions at any stage
                if (status === "IN_PROGRESS") {
                    filters.excludeStatus = ["REJECTED", "COMPLETED"];
                }
            } else {
                // For reviewers/staff, exclude DRAFT applications
                filters.excludeStatus = ["DRAFT"];

                // Mode: "pending" - Show applications currently at this step waiting for action
                // Mode: "processed" - Show applications that have been processed by this role (based on history)
                if (mode === "pending" && currentStep) {
                    // Applications currently at this step that haven't been processed by this role
                    filters.currentStep = Number(currentStep);
                    filters.currentRoleId = user.roleId;
                    filters.roleFilterMode = "pending";
                    // Exclude COMPLETED and REJECTED for pending list
                    filters.excludeStatus = ["DRAFT", "COMPLETED", "REJECTED"];
                } else if (mode === "processed" && currentStep) {
                    // Applications that have been processed by this role (based on history)
                    filters.currentRoleId = user.roleId;
                    filters.roleFilterMode = "processed";
                    // Don't use processedByStep - we filter by history instead
                } else if (!mode && user.roleId) {
                    // DEFAULT MODE (e.g. Dashboard "Recent Letters" - Semua Surat)
                    // Show all letters that have been processed by OR currently at this role
                    filters.currentRoleId = user.roleId;
                    filters.roleFilterMode = "all"; // Show both pending and processed
                }
            }

            const result = await ApplicationService.listApplications(filters);

            return {
                success: true,
                data: result.items.map((app: any) => {
                    const mahasiswa = app.createdBy?.mahasiswa;
                    const values = app.values || {};

                    // Find the latest revision entry to get who requested the revision
                    let lastRevisionFromRole: string | undefined = undefined;
                    if (
                        app.status === "REVISION" &&
                        app.history &&
                        Array.isArray(app.history)
                    ) {
                        const revisionHistory = [...app.history]
                            .reverse()
                            .find((h: any) => h.status === "REVISION");
                        if (
                            revisionHistory &&
                            revisionHistory.actor?.userRole?.[0]?.role
                        ) {
                            const rawRoleName =
                                revisionHistory.actor.userRole[0].role.name;
                            lastRevisionFromRole =
                                ApplicationController.formatRoleName(
                                    rawRoleName,
                                );
                        }
                    }

                    // Find the last actor who approved or rejected (for COMPLETED/REJECTED status)
                    let lastActorRole: string | undefined = undefined;
                    if (
                        (app.status === "COMPLETED" ||
                            app.status === "REJECTED") &&
                        app.history &&
                        Array.isArray(app.history)
                    ) {
                        // Get the last entry in history (most recent action)
                        const lastHistory = app.history[app.history.length - 1];
                        if (lastHistory && lastHistory.role?.name) {
                            lastActorRole =
                                ApplicationController.formatRoleName(
                                    lastHistory.role.name,
                                );
                        }
                    }

                    return {
                        id: app.id,
                        scholarshipName: app.scholarshipName,
                        letterType: app.letterType ? {
                            id: app.letterType.id,
                            name: app.letterType.name,
                            description: app.letterType.description,
                        } : undefined,
                        status: app.status,
                        currentStep: app.currentStep,
                        lastRevisionFromRole,
                        lastActorRole,
                        letterNumber: app.letterNumber,
                        applicantName: app.createdBy?.name || "",
                        updatedAt: app.updatedAt,
                        formData: {
                            ...values, // Include all stored form values
                            nim: mahasiswa?.nim || (values as any).nim || "",
                            departemen:
                                mahasiswa?.departemen?.name ||
                                (values as any).departemen ||
                                "",
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
     * Get application or create new if not found
     * Useful for handling cases where old application IDs are no longer valid
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
                "📥 [getApplicationOrCreate] Fetching or creating application:",
                applicationId,
            );

            // Try to fetch existing application
            let application =
                await ApplicationService.getApplicationById(applicationId);

            if (application) {
                console.log(
                    "✅ [getApplicationOrCreate] Found existing application:",
                    applicationId,
                );
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
                    semester: mahasiswa?.semester
                        ? String(mahasiswa.semester)
                        : "",
                    ipk: mahasiswa?.ipk ? String(mahasiswa.ipk) : "",
                    ips: mahasiswa?.ips ? String(mahasiswa.ips) : "",
                    ...(application.values &&
                    typeof application.values === "object"
                        ? application.values
                        : {}),
                    namaBeasiswa: application.scholarshipName,
                };

                return {
                    success: true,
                    data: {
                        ...application,
                        formData,
                        attachments: await Promise.all(
                            application.attachments.map(async (att: any) => {
                                let downloadUrl = "";
                                try {
                                    downloadUrl =
                                        await MinioService.getPresignedUrl(
                                            "",
                                            att.domain,
                                            3600,
                                        );
                                } catch (err) {
                                    console.error(
                                        "Failed to generate presigned URL:",
                                        err,
                                    );
                                }
                                return { ...att, downloadUrl };
                            }),
                        ),
                        verification: application.verification
                            ? {
                                  code: application.verification.code,
                                  verifiedCount:
                                      application.verification.verifiedCount,
                                  qrCodeUrl: getQRCodeImageUrl(
                                      application.verification.code,
                                      process.env.NEXT_PUBLIC_APP_URL ||
                                          "http://localhost:3000",
                                  ),
                                  verifyLink: getQRCodeUrl(
                                      application.verification.code,
                                      process.env.NEXT_PUBLIC_APP_URL ||
                                          "http://localhost:3000",
                                  ),
                              }
                            : null,
                    },
                };
            }

            // Application not found, create new DRAFT
            console.log(
                "⚠️ [getApplicationOrCreate] Application not found, creating new DRAFT",
            );

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

            console.log(
                "✅ [getApplicationOrCreate] Created new DRAFT application:",
                {
                    id: newApplication.id,
                    createdById: newApplication.createdById,
                },
            );

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
                "📥 [getApplicationDetail] Fetching application:",
                applicationId,
            );

            const application =
                await ApplicationService.getApplicationById(applicationId);

            if (!application) {
                console.warn(
                    "⚠️ [getApplicationDetail] Application not found:",
                    {
                        applicationId,
                        message: "Surat tidak ditemukan atau telah dihapus",
                    },
                );
                set.status = 404;
                return {
                    error: "Surat tidak ditemukan atau telah dihapus. Silakan kembali ke daftar surat dan buat yang baru.",
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

            return {
                success: true,
                data: {
                    ...application,
                    formData,
                    attachments: await Promise.all(
                        application.attachments.map(async (att: any) => {
                            let downloadUrl = "";
                            try {
                                downloadUrl =
                                    await MinioService.getPresignedUrl(
                                        "",
                                        att.domain,
                                        3600,
                                    );
                            } catch (err) {
                                console.error(
                                    "Failed to generate presigned URL:",
                                    err,
                                );
                            }
                            return { ...att, downloadUrl };
                        }),
                    ),
                    verification: application.verification
                        ? {
                              code: application.verification.code,
                              verifiedCount:
                                  application.verification.verifiedCount,
                              qrCodeUrl: getQRCodeImageUrl(
                                  application.verification.code,
                                  process.env.NEXT_PUBLIC_APP_URL ||
                                      "http://localhost:3000",
                              ),
                              verifyLink: getQRCodeUrl(
                                  application.verification.code,
                                  process.env.NEXT_PUBLIC_APP_URL ||
                                      "http://localhost:3000",
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
            const {
                action,
                notes,
                targetStep,
                signatureUrl,
                letterNumber,
                stampId,
            } = body;

            // Define Role Mappings
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

            let newStatus = currentApp.status;
            let newStep = currentApp.currentStep ?? 1;
            let nextRoleId: string | undefined = undefined;
            let targetRoleNameForHistory = ""; // Track target role for revision history
            // Initialize update values with existing values or empty object
            // We need to cast values to any to allow adding properties
            let newValues = (currentApp.values as any) || {};

            switch (action) {
                case "approve":
                    // Check Logic based on Current Step
                    if (newStep === 3) {
                        // WD1 Approval -> Requires Signature
                        if (!signatureUrl) {
                            set.status = 400;
                            return {
                                error: "Signature URL is required for WD1 approval",
                            };
                        }
                        newValues = {
                            ...newValues,
                            wd1_signature: signatureUrl,
                        };
                    } else if (newStep === 4) {
                        // UPA Approval -> Requires Letter Number (Publish)
                        if (!letterNumber) {
                            set.status = 400;
                            return {
                                error: "Letter Number is required for Publishing",
                            };
                        }
                        // Status becomes COMPLETED
                        newStatus = "COMPLETED";
                    }

                    // Increment Logic
                    if (newStep < 4) {
                        newStep += 1;
                        newStatus = "IN_PROGRESS";
                        // Find next role name
                        const nextRoleName = STEP_ROLE_MAP[newStep];
                        if (nextRoleName) {
                            const role = await db.role.findUnique({
                                where: { name: nextRoleName },
                            });
                            if (role) nextRoleId = role.id;
                        }
                    } else {
                        // Reached UPA (Step 4) and approved -> Done
                        newStatus = "COMPLETED";
                        // Keep current role (UPA) or clear it?
                        // Usually for completed letters, currentRole might be null or irrelevant.
                        // Let's clear it to indicate no one "holds" it pending action.
                        nextRoleId = null as any;
                    }
                    break;
                case "reject":
                    newStatus = "REJECTED";
                    nextRoleId = null as any; // No one holds a rejected letter
                    break;
                case "revision":
                    newStatus = "REVISION";
                    if (targetStep !== undefined) {
                        newStep = Number(targetStep);

                        if (newStep === 0) {
                            nextRoleId = undefined; // Null/Undefined = Mahasiswa
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
                        // Default revision: Go back 1 step?
                        if (newStep > 0) newStep -= 1;
                        // Determine role logic same as above
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

            // Prepare update data
            const updateData: any = {
                status: newStatus,
                currentStep: newStep,
                currentRoleId: nextRoleId,
                values: newValues,
            };

            // Handle explicit null for nextRoleId (e.g. Mahasiswa or Completed/Rejected)
            if (
                nextRoleId === undefined &&
                (newStep === 0 || action === "revision")
            ) {
                updateData.currentRoleId = null;
            }
            if (nextRoleId === null) {
                updateData.currentRoleId = null;
            }

            // Handle PublishedAt if Completed
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
                    roleId: user.roleId || null, // Pass user's roleId to track which role processed it
                },
            );

            // Trigger notifications based on action
            try {
                const userRoles = Array.isArray(user?.roles)
                    ? user.roles
                    : [user?.role].filter(Boolean);
                const currentRoleName = userRoles[0] || "Unknown";

                switch (action) {
                    case "approve": {
                        // Notify next role (if not completed)
                        if (newStatus === "IN_PROGRESS" && newStep <= 4) {
                            const STEP_ROLE_MAP_NAMES: Record<number, string> =
                                {
                                    1: "SUPERVISOR",
                                    2: "MANAJER_TU",
                                    3: "WAKIL_DEKAN_1",
                                    4: "UPA",
                                };
                            const nextRoleName = STEP_ROLE_MAP_NAMES[newStep];
                            if (nextRoleName) {
                                const nextRoleUsers =
                                    await db.userRole.findMany({
                                        where: { role: { name: nextRoleName } },
                                        include: { user: true },
                                    });
                                if (nextRoleUsers.length > 0) {
                                    const nextRoleUserIds = nextRoleUsers.map(
                                        (ur) => ur.user.id,
                                    );
                                    await notifyApplicationReadyForReview({
                                        nextRoleUserIds,
                                        applicationId,
                                        scholarshipName:
                                            currentApp.scholarshipName ||
                                            "Surat Rekomendasi",
                                        applicantName:
                                            currentApp.createdBy?.name ||
                                            "Mahasiswa",
                                        currentRoleName,
                                    });
                                }
                            }
                        }
                        // Notify applicant if completed (published)
                        else if (newStatus === "COMPLETED") {
                            await notifyApplicationPublished({
                                applicantUserId: currentApp.createdById,
                                applicationId,
                                scholarshipName:
                                    currentApp.scholarshipName ||
                                    "Surat Rekomendasi",
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
                                currentApp.scholarshipName ||
                                "Surat Rekomendasi",
                            rejectionReason: notes,
                            rejectedByRole: currentRoleName,
                        });
                        break;
                    }

                    case "revision": {
                        // Determine target role for revision
                        let targetRoleName = "";
                        if (newStep === 0) {
                            // Revision to Mahasiswa
                            await notifyApplicationRevisionRequested({
                                applicantUserId: currentApp.createdById,
                                applicationId,
                                scholarshipName:
                                    currentApp.scholarshipName ||
                                    "Surat Rekomendasi",
                                revisionNotes: notes,
                                requestedByRole: currentRoleName,
                            });
                        } else {
                            // Revision to specific role
                            const STEP_ROLE_MAP_NAMES: Record<number, string> =
                                {
                                    1: "SUPERVISOR",
                                    2: "MANAJER_TU",
                                    3: "WAKIL_DEKAN_1",
                                    4: "UPA",
                                };
                            targetRoleName = STEP_ROLE_MAP_NAMES[newStep] || "";

                            if (targetRoleName) {
                                const targetRoleUsers =
                                    await db.userRole.findMany({
                                        where: {
                                            role: { name: targetRoleName },
                                        },
                                        include: { user: true },
                                    });

                                if (targetRoleUsers.length > 0) {
                                    const targetRoleUserIds =
                                        targetRoleUsers.map((ur) => ur.user.id);
                                    // Notify target role about revision task
                                    await notifyApplicationReadyForReview({
                                        nextRoleUserIds: targetRoleUserIds,
                                        applicationId,
                                        scholarshipName:
                                            currentApp.scholarshipName ||
                                            "Surat Rekomendasi",
                                        applicantName:
                                            currentApp.createdBy?.name ||
                                            "Mahasiswa",
                                        currentRoleName: `${currentRoleName} (Revisi)`,
                                    });
                                }
                            }

                            // Also notify applicant about revision
                            await notifyApplicationRevisionRequested({
                                applicantUserId: currentApp.createdById,
                                applicationId,
                                scholarshipName:
                                    currentApp.scholarshipName ||
                                    "Surat Rekomendasi",
                                revisionNotes: notes,
                                requestedByRole: currentRoleName,
                            });
                        }
                        break;
                    }
                }
            } catch (notifyError) {
                console.error(
                    "❌ Failed to send notification in verifyApplication:",
                    {
                        error:
                            notifyError instanceof Error
                                ? notifyError.message
                                : notifyError,
                        action,
                        applicationId,
                    },
                );
                // Don't fail the request if notification fails
            }

            return { success: true, data: updated };
        } catch (error) {
            console.error("Verify application error:", error);
            set.status = 500;
            return { error: "Verification failed" };
        }
    }

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
            const userRoles = Array.isArray(user?.roles)
                ? user.roles
                : [user?.role].filter(Boolean);
            const isMahasiswa = userRoles.some(
                (r: string) => r.toUpperCase() === "MAHASISWA",
            );

            // For Mahasiswa: use original stats logic (filter by createdById)
            if (isMahasiswa) {
                const filters: any = { createdById: user.id };

                const stats = await ApplicationService.getStats(
                    "srb-type-id",
                    filters,
                );
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
            console.error("Delete application error:", error);

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
}
