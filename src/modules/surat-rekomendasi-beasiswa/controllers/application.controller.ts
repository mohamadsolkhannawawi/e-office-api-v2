import { ApplicationService } from "../services/application.service.ts";
import { ROLE_STEP_MAP } from "../constants.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";
import { Prisma } from "../../../db/index.ts";
import {
    getQRCodeImageUrl,
    getQRCodeUrl,
} from "../../../services/verification.service.ts";

const db = Prisma;

export class ApplicationController {
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

            set.status = 201;
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

            const updated = await ApplicationService.updateApplicationData(
                applicationId,
                {
                    namaBeasiswa,
                    values,
                    status,
                },
            );

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
                    // Applications that have been processed by this role
                    filters.currentRoleId = user.roleId;
                    filters.roleFilterMode = "processed";
                    filters.processedByStep = Number(currentStep);
                } else if (!mode && user.roleId) {
                    // DEFAULT MODE (e.g. Dashboard "Recent Letters")
                    // If reviewer has a roleId, show "Relevant" items only
                    const roleName = userRoles[0]; // Assume primary role
                    const roleStep = ROLE_STEP_MAP[roleName];

                    if (roleStep) {
                        filters.currentStep = roleStep;
                        filters.currentRoleId = user.roleId;
                        filters.roleFilterMode = "relevant";
                    }
                }
            }

            const result = await ApplicationService.listApplications(filters);

            return {
                success: true,
                data: result.items.map((app: any) => {
                    const mahasiswa = app.createdBy?.mahasiswa;
                    const values = app.values || {};

                    return {
                        id: app.id,
                        scholarshipName: app.scholarshipName,
                        status: app.status,
                        currentStep: app.currentStep,
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

    static async getApplicationDetail({
        params,
        set,
    }: {
        params: any;
        set: any;
    }) {
        try {
            const { applicationId } = params;
            const application =
                await ApplicationService.getApplicationById(applicationId);

            if (!application) {
                set.status = 404;
                return { error: "Application not found" };
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
            return { error: "Failed to fetch application" };
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
            const { action, notes, targetStep, signatureUrl, letterNumber } =
                body;

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
                        } else {
                            const targetRoleName = STEP_ROLE_MAP[newStep];
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
                        } else {
                            const targetRoleName = STEP_ROLE_MAP[newStep];
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
            }

            const updated = await ApplicationService.updateApplicationStatus(
                applicationId,
                updateData,
                {
                    actorId: user.id,
                    action: action,
                    note: notes,
                    roleId: user.roleId || null, // Pass user's roleId to track which role processed it
                },
            );

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
            const filters: any = {};

            const userRoles = Array.isArray(user?.roles)
                ? user.roles
                : [user?.role].filter(Boolean);
            const isMahasiswa = userRoles.some(
                (r: string) => r.toUpperCase() === "MAHASISWA",
            );

            if (isMahasiswa) {
                filters.createdById = user.id;
            } else if (user.roleId) {
                // Detect reviewer role and step
                const roleName = userRoles[0];
                const roleStep = ROLE_STEP_MAP[roleName];

                if (roleStep) {
                    filters.currentRoleId = user.roleId;
                    filters.currentStep = roleStep;
                }
            }

            // Allow manual filtering by student ID if provided in query (optional)
            if (query?.studentId) {
                filters.createdById = query.studentId;
            }

            const stats = await ApplicationService.getStats(
                "srb-type-id",
                filters,
            );
            return { success: true, data: stats };
        } catch (error) {
            console.error("Get stats error:", error);
            set.status = 500;
            return { error: "Failed to fetch statistics" };
        }
    }
}
