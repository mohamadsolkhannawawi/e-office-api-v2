import { ApplicationService } from "../services/application.service.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";
import { Prisma } from "../../../db/index.ts";

const db = Prisma;

export class ApplicationController {
    static async createApplication({ body, set }: { body: any; set: any }) {
        try {
            const { namaBeasiswa, values } = body;

            // Find default user (from seed) untuk development
            const defaultUser = await db.user.findFirst({
                where: { email: "admin@university.ac.id" },
            });

            if (!defaultUser) {
                set.status = 500;
                return { error: "Default user not found." };
            }

            const letterType = await db.letterType.findUnique({
                where: { id: "surat-rekomendasi-beasiswa" },
            });

            if (!letterType) {
                set.status = 500;
                return { error: "LetterType not found." };
            }

            const application = await ApplicationService.createApplication({
                namaBeasiswa,
                values: values || {},
                userId: defaultUser.id,
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

    static async listApplications({ query, set }: { query: any; set: any }) {
        try {
            const { status, currentStep, page, limit } = query || {};
            const result = await ApplicationService.listApplications({
                letterTypeId: "surat-rekomendasi-beasiswa",
                status,
                currentStep: currentStep ? Number(currentStep) : undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

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
                        formData: {
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
                nim: mahasiswa?.nim,
                departemen: mahasiswa?.departemen?.name,
                programStudi: mahasiswa?.programStudi?.name,
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
    }: {
        params: any;
        body: any;
        set: any;
    }) {
        try {
            const { applicationId } = params;
            const { action, notes } = body;

            const currentApp =
                await ApplicationService.getApplicationById(applicationId);
            if (!currentApp) {
                set.status = 404;
                return { error: "Application not found" };
            }

            let newStatus: string;
            let newStep = currentApp.currentStep ?? 1;

            switch (action) {
                case "approve":
                    // If it's the last step (e.g. step 3 for WD1), set to COMPLETED
                    if (newStep >= 3) {
                        newStatus = "COMPLETED";
                        newStep = 4;
                    } else {
                        newStatus = "IN_PROGRESS";
                        newStep += 1;
                    }
                    break;
                case "reject":
                    newStatus = "REJECTED";
                    break;
                case "revision":
                    newStatus = "PENDING"; // Back to pending/revision
                    break;
                default:
                    set.status = 400;
                    return { error: "Invalid action" };
            }

            const updated = await ApplicationService.updateApplicationStatus(
                applicationId,
                {
                    status: newStatus,
                    currentStep: newStep,
                },
            );

            return { success: true, data: updated };
        } catch (error) {
            console.error("Verify application error:", error);
            set.status = 500;
            return { error: "Verification failed" };
        }
    }

    static async getStats({ set }: { set: any }) {
        try {
            const stats = await ApplicationService.getStats(
                "surat-rekomendasi-beasiswa",
            );
            return { success: true, data: stats };
        } catch (error) {
            console.error("Get stats error:", error);
            set.status = 500;
            return { error: "Failed to fetch statistics" };
        }
    }
}
