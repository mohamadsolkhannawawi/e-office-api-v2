import { Elysia, t } from "elysia";
import { authMiddleware } from "@/middlewares/auth";
import { AttachmentService } from "@/services/attachment.service";
import db from "@/db";

const suratRekomendasiRoutes = new Elysia({
	prefix: "/surat-rekomendasi",
	tags: ["surat-rekomendasi"],
})
	.use(authMiddleware)

	/**
	 * POST /surat-rekomendasi/applications
	 * Create new scholarship application (LetterInstance)
	 */
	.post(
		"/applications",
		async ({ body, user, set }) => {
			try {
				if (!user) {
					set.status = 401;
					return { error: "Unauthorized" };
				}

				const { namaBeasiswa, values } = body;

				// Create LetterInstance
				const letterInstance = await db.letterInstance.create({
					data: {
						scholarshipName: namaBeasiswa,
						values: values, // JSON dengan ipk, ips, noHp, dll
						status: "PENDING",
						currentStep: 4, // Sudah submit semua step
						letterTypeId: "surat-rekomendasi-beasiswa", // Hardcoded atau dari config
						createdById: user.id,
					},
				});

				set.status = 201;
				return {
					success: true,
					data: {
						id: letterInstance.id,
						scholarshipName: letterInstance.scholarshipName,
						status: letterInstance.status,
						createdAt: letterInstance.createdAt,
					},
				};
			} catch (error) {
				console.error("Create application error:", error);
				set.status = 500;
				return {
					error: error instanceof Error ? error.message : "Internal server error",
				};
			}
		},
		{
			body: t.Object({
				namaBeasiswa: t.String(),
				values: t.Record(t.String(), t.Any()), // JSON dengan ipk, ips, noHp, dll
			}),
		},
	)

	/**
	 * POST /surat-rekomendasi/:letterInstanceId/upload
	 * Upload attachment file ke MinIO dan simpan metadata ke database
	 */
	.post(
		"/:letterInstanceId/upload",
		async ({ params, body, user, set }) => {
			try {
				if (!user) {
					set.status = 401;
					return { error: "Unauthorized" };
				}

				const { letterInstanceId } = params;
				const { file, category } = body;

				// Verify letter instance exists dan milik user
				const letterInstance = await db.letterInstance.findUnique({
					where: { id: letterInstanceId },
				});

				if (!letterInstance) {
					set.status = 404;
					return { error: "Letter instance not found" };
				}

				if (letterInstance.createdById !== user.id) {
					set.status = 403;
					return { error: "Forbidden: This letter instance is not yours" };
				}

				// Upload attachment
				const attachment = await AttachmentService.uploadAttachment({
					file,
					letterInstanceId,
					userId: user.id,
					category: category as "Utama" | "Tambahan",
				});

				set.status = 201;
				return {
					success: true,
					data: attachment,
				};
			} catch (error) {
				console.error("Upload attachment error:", error);
				set.status = 500;
				return {
					error: error instanceof Error ? error.message : "Upload failed",
				};
			}
		},
		{
			params: t.Object({
				letterInstanceId: t.String(),
			}),
			body: t.Object({
				file: t.File(),
				category: t.String({ enum: ["Utama", "Tambahan"] }),
			}),
		},
	)

	/**
	 * GET /surat-rekomendasi/:letterInstanceId/attachments
	 * Get all attachments untuk sebuah application
	 */
	.get(
		"/:letterInstanceId/attachments",
		async ({ params, user, set }) => {
			try {
				if (!user) {
					set.status = 401;
					return { error: "Unauthorized" };
				}

				const { letterInstanceId } = params;

				// Verify ownership
				const letterInstance = await db.letterInstance.findUnique({
					where: { id: letterInstanceId },
				});

				if (!letterInstance) {
					set.status = 404;
					return { error: "Letter instance not found" };
				}

				if (letterInstance.createdById !== user.id) {
					set.status = 403;
					return { error: "Forbidden" };
				}

				// Get attachments
				const attachments = await AttachmentService.getLetterAttachments(
					letterInstanceId,
				);

				return {
					success: true,
					data: attachments,
				};
			} catch (error) {
				console.error("Get attachments error:", error);
				set.status = 500;
				return {
					error: error instanceof Error ? error.message : "Failed to fetch attachments",
				};
			}
		},
		{
			params: t.Object({
				letterInstanceId: t.String(),
			}),
		},
	)

	/**
	 * DELETE /surat-rekomendasi/attachments/:attachmentId
	 * Delete attachment
	 */
	.delete(
		"/attachments/:attachmentId",
		async ({ params, user, set }) => {
			try {
				if (!user) {
					set.status = 401;
					return { error: "Unauthorized" };
				}

				const { attachmentId } = params;

				// Verify ownership
				const attachment = await db.attachment.findUnique({
					where: { id: attachmentId },
					include: { letterInstance: true },
				});

				if (!attachment) {
					set.status = 404;
					return { error: "Attachment not found" };
				}

				if (attachment.letterInstance?.createdById !== user.id) {
					set.status = 403;
					return { error: "Forbidden" };
				}

				// Delete
				await AttachmentService.deleteAttachment(attachmentId);

				return {
					success: true,
					message: "Attachment deleted successfully",
				};
			} catch (error) {
				console.error("Delete attachment error:", error);
				set.status = 500;
				return {
					error: error instanceof Error ? error.message : "Delete failed",
				};
			}
		},
		{
			params: t.Object({
				attachmentId: t.String(),
			}),
		},
	)

	/**
	 * GET /surat-rekomendasi/:applicationId
	 * Get application detail beserta attachments
	 */
	.get(
		"/:applicationId",
		async ({ params, user, set }) => {
			try {
				if (!user) {
					set.status = 401;
					return { error: "Unauthorized" };
				}

				const { applicationId } = params;

				// Get letter instance dengan attachments
				const application = await db.letterInstance.findUnique({
					where: { id: applicationId },
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

				if (!application) {
					set.status = 404;
					return { error: "Application not found" };
				}

				if (application.createdById !== user.id) {
					set.status = 403;
					return { error: "Forbidden" };
				}

				// Reconstruct form data dari LetterInstance + relations
				const mahasiswa = application.createdBy.mahasiswa;
				const formData = {
					namaLengkap: application.createdBy.name,
					email: application.createdBy.email,
					role: "Mahasiswa", // Bisa dari user role
					nim: mahasiswa?.nim,
					departemen: mahasiswa?.departemen?.name,
					programStudi: mahasiswa?.programStudi?.name,
					tempatLahir: mahasiswa?.tempatLahir,
					tanggalLahir: mahasiswa?.tanggalLahir,
					...application.values, // ipk, ips, noHp dari values JSON
					namaBeasiswa: application.scholarshipName,
				};

				return {
					success: true,
					data: {
						id: application.id,
						formData,
						status: application.status,
						currentStep: application.currentStep,
						attachments: application.attachments.map((att) => ({
							id: att.id,
							filename: att.filename,
							fileSize: att.fileSize,
							mimeType: att.mimeType,
							category: att.category,
							attachmentType: att.attachmentType,
							createdAt: att.createdAt,
						})),
						createdAt: application.createdAt,
						updatedAt: application.updatedAt,
					},
				};
			} catch (error) {
				console.error("Get application error:", error);
				set.status = 500;
				return {
					error: error instanceof Error ? error.message : "Failed to fetch application",
				};
			}
		},
		{
			params: t.Object({
				applicationId: t.String(),
			}),
		},
	);

export default suratRekomendasiRoutes;
