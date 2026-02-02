import { Prisma } from "@backend/db/index.ts";

/**
 * Notification Service
 * Service untuk mengelola notifikasi pengguna
 */

export type NotificationType =
    | "APPLICATION_SUBMITTED"
    | "APPLICATION_APPROVED"
    | "APPLICATION_REJECTED"
    | "APPLICATION_REVISION"
    | "APPLICATION_PUBLISHED"
    | "NEW_TASK";

interface CreateNotificationParams {
    userId: string;
    title: string;
    message: string;
    type: NotificationType;
    entityId?: string;
    letterInstanceId?: string;
}

/**
 * Helper: Convert database role name to user-friendly format
 */
export function formatRoleName(roleName: string | null | undefined): string {
    if (!roleName) return "Sistem";
    
    const roleMap: Record<string, string> = {
        SUPERVISOR: "Supervisor Akademik",
        MANAJER_TU: "Manajer TU",
        WAKIL_DEKAN_1: "Wakil Dekan 1",
        UPA: "Staff UPA",
        MAHASISWA: "Mahasiswa",
        // Handle lowercase variations
        supervisor: "Supervisor Akademik",
        manajer_tu: "Manajer TU",
        wakil_dekan_1: "Wakil Dekan 1",
        upa: "Staff UPA",
        mahasiswa: "Mahasiswa",
    };
    
    return roleMap[roleName] || roleName;
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams) {
    try {
        console.log("🔔 [createNotification] Starting with:", {
            userId: params.userId,
            title: params.title,
            type: params.type,
            letterInstanceId: params.letterInstanceId,
        });

        // Validate required fields
        if (!params.userId) {
            throw new Error("userId is required");
        }
        if (!params.title) {
            throw new Error("title is required");
        }
        if (!params.message) {
            throw new Error("message is required");
        }
        if (!params.type) {
            throw new Error("type is required");
        }

        console.log(
            "📋 [createNotification] Validation passed, about to insert into database...",
        );

        const notification = await Prisma.notification.create({
            data: {
                userId: params.userId,
                title: params.title,
                message: params.message,
                type: params.type,
                entityId: params.entityId || null,
                letterInstanceId: params.letterInstanceId || null,
                isRead: false,
            },
        });

        console.log("✅ [createNotification] Success! Created notification:", {
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            createdAt: notification.createdAt,
        });
        return notification;
    } catch (error: any) {
        console.error("❌ [createNotification] Error:", {
            error: error?.message || error,
            stack: error?.stack,
            userId: params.userId,
            type: params.type,
        });
        throw error;
    }
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
    userId: string,
    options?: {
        limit?: number;
        unreadOnly?: boolean;
    },
) {
    return await Prisma.notification.findMany({
        where: {
            userId,
            ...(options?.unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: options?.limit || 20,
    });
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
    return await Prisma.notification.count({
        where: { userId, isRead: false },
    });
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string, userId: string) {
    return await Prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { isRead: true },
    });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string) {
    return await Prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
    });
}

/**
 * Notify supervisors when application status changes
 * @deprecated Use specific notification functions instead
 */
export async function notifyApplicationStatusChange(params: {
    applicationId: string;
    applicantUserId: string;
    scholarshipName: string;
    newStatus: string;
    actorName?: string;
    actorRole?: string;
}) {
    const {
        applicationId,
        applicantUserId,
        scholarshipName,
        newStatus,
        actorName,
        actorRole,
    } = params;

    const friendlyRoleName = formatRoleName(actorRole);
    let title = "";
    let message = "";
    let type: NotificationType = "APPLICATION_APPROVED";

    switch (newStatus) {
        case "APPROVED":
        case "IN_PROGRESS":
            title = "Pengajuan Disetujui";
            message = `Pengajuan ${scholarshipName} Anda telah disetujui${friendlyRoleName ? ` oleh ${friendlyRoleName}` : ""}.`;
            type = "APPLICATION_APPROVED";
            break;
        case "REJECTED":
            title = "Pengajuan Ditolak";
            message = `Pengajuan ${scholarshipName} Anda ditolak${friendlyRoleName ? ` oleh ${friendlyRoleName}` : ""}.`;
            type = "APPLICATION_REJECTED";
            break;
        case "REVISION":
            title = "Perlu Revisi";
            message = `Pengajuan ${scholarshipName} Anda memerlukan revisi${friendlyRoleName ? ` dari ${friendlyRoleName}` : ""}.`;
            type = "APPLICATION_REVISION";
            break;
        case "COMPLETED":
        case "PUBLISHED":
            title = "Surat Terbit!";
            message = `Selamat! Surat rekomendasi beasiswa ${scholarshipName} telah terbit dan siap diunduh.`;
            type = "APPLICATION_PUBLISHED";
            break;
        default:
            return null;
    }

    return await createNotification({
        userId: applicantUserId,
        title,
        message,
        type,
        entityId: applicationId,
        letterInstanceId: applicationId,
    });
}

/**
 * Notify reviewers about new task
 */
export async function notifyNewTask(params: {
    reviewerUserIds: string[];
    applicationId: string;
    scholarshipName: string;
    applicantName: string;
    fromRole?: string;
}) {
    const { reviewerUserIds, applicationId, scholarshipName, applicantName, fromRole } =
        params;

    const friendlyFromRole = formatRoleName(fromRole);
    const notifications = await Promise.all(
        reviewerUserIds.map((userId) =>
            createNotification({
                userId,
                title: "Pengajuan Baru",
                message: fromRole 
                    ? `Pengajuan ${scholarshipName} dari ${applicantName} telah disetujui oleh ${friendlyFromRole} dan memerlukan persetujuan Anda.`
                    : `Pengajuan ${scholarshipName} dari ${applicantName} memerlukan persetujuan Anda.`,
                type: "NEW_TASK",
                entityId: applicationId,
                letterInstanceId: applicationId,
            }),
        ),
    );

    return notifications;
}

/**
 * Notify supervisor about new application submission from student
 */
export async function notifyApplicationSubmitted(params: {
    supervisorUserIds: string[];
    applicationId: string;
    scholarshipName: string;
    applicantName: string;
    isResubmission?: boolean;
}) {
    const { supervisorUserIds, applicationId, scholarshipName, applicantName, isResubmission } =
        params;

    console.log("🔔 [notifyApplicationSubmitted] Called with:", {
        supervisorUserIds,
        supervisorCount: supervisorUserIds.length,
        applicationId,
        scholarshipName,
        applicantName,
        isResubmission,
    });

    if (!supervisorUserIds || supervisorUserIds.length === 0) {
        console.warn(
            "⚠️ [notifyApplicationSubmitted] No supervisor user IDs provided",
        );
        return [];
    }

    try {
        console.log(
            `🔔 [notifyApplicationSubmitted] Creating ${supervisorUserIds.length} notifications...`,
        );

        const title = isResubmission ? "Pengajuan Revisi Masuk" : "Pengajuan Baru Masuk";
        const message = isResubmission
            ? `${applicantName} telah mengirim ulang pengajuan surat rekomendasi beasiswa ${scholarshipName} setelah revisi. Silakan tinjau dan berikan persetujuan.`
            : `${applicantName} telah mengajukan surat rekomendasi beasiswa ${scholarshipName}. Silakan tinjau dan berikan persetujuan.`;

        const notifications = await Promise.all(
            supervisorUserIds.map((userId, index) => {
                console.log(
                    `🔔 [notifyApplicationSubmitted] [${index + 1}/${supervisorUserIds.length}] Creating for user: ${userId}`,
                );
                return createNotification({
                    userId,
                    title,
                    message,
                    type: "APPLICATION_SUBMITTED",
                    entityId: applicationId,
                    letterInstanceId: applicationId,
                });
            }),
        );

        console.log(
            `✅ [notifyApplicationSubmitted] Successfully created ${notifications.length} notifications`,
        );
        return notifications;
    } catch (error) {
        console.error("❌ [notifyApplicationSubmitted] Error:", {
            error: error instanceof Error ? error.message : error,
            supervisorUserIds,
        });
        throw error;
    }
}

/**
 * Notify next role about application ready for review (after approval)
 */
export async function notifyApplicationReadyForReview(params: {
    nextRoleUserIds: string[];
    applicationId: string;
    scholarshipName: string;
    applicantName: string;
    currentRoleName: string;
    isRevision?: boolean;
}) {
    const {
        nextRoleUserIds,
        applicationId,
        scholarshipName,
        applicantName,
        currentRoleName,
        isRevision,
    } = params;

    const friendlyCurrentRole = formatRoleName(currentRoleName.replace(" (Revisi)", ""));
    
    let title: string;
    let message: string;
    
    if (isRevision) {
        title = "Revisi Menunggu Tindakan Anda";
        message = `Surat rekomendasi beasiswa ${scholarshipName} dari ${applicantName} memerlukan revisi Anda. Diminta oleh ${friendlyCurrentRole}.`;
    } else {
        title = "Surat Menunggu Persetujuan";
        message = `Surat rekomendasi beasiswa ${scholarshipName} dari ${applicantName} telah disetujui oleh ${friendlyCurrentRole} dan menunggu persetujuan Anda.`;
    }

    const notifications = await Promise.all(
        nextRoleUserIds.map((userId) =>
            createNotification({
                userId,
                title,
                message,
                type: "NEW_TASK",
                entityId: applicationId,
                letterInstanceId: applicationId,
            }),
        ),
    );

    return notifications;
}

/**
 * Notify applicant about application rejection
 */
export async function notifyApplicationRejected(params: {
    applicantUserId: string;
    applicationId: string;
    scholarshipName: string;
    rejectionReason?: string;
    rejectedByRole?: string;
}) {
    const {
        applicantUserId,
        applicationId,
        scholarshipName,
        rejectionReason,
        rejectedByRole,
    } = params;

    const friendlyRoleName = formatRoleName(rejectedByRole);
    
    let message = `Pengajuan surat rekomendasi beasiswa ${scholarshipName} Anda telah ditolak`;
    if (friendlyRoleName) {
        message += ` oleh ${friendlyRoleName}`;
    }
    message += ".";
    if (rejectionReason) {
        message += ` Alasan: ${rejectionReason}`;
    }

    return await createNotification({
        userId: applicantUserId,
        title: "Pengajuan Ditolak",
        message,
        type: "APPLICATION_REJECTED",
        entityId: applicationId,
        letterInstanceId: applicationId,
    });
}

/**
 * Notify applicant about revision request (from any role to mahasiswa)
 */
export async function notifyApplicationRevisionRequested(params: {
    applicantUserId: string;
    applicationId: string;
    scholarshipName: string;
    revisionNotes?: string;
    requestedByRole?: string;
}) {
    const {
        applicantUserId,
        applicationId,
        scholarshipName,
        revisionNotes,
        requestedByRole,
    } = params;

    const friendlyRoleName = formatRoleName(requestedByRole);

    // Ensure the notification is sent only if the applicant is the intended recipient
    const application = await Prisma.letterInstance.findUnique({
        where: { id: applicationId },
        select: { createdById: true },
    });

    if (!application || application.createdById !== applicantUserId) {
        console.warn(
            "Notification skipped: Applicant is not the intended recipient.",
        );
        return null;
    }

    let message = `Pengajuan surat rekomendasi beasiswa ${scholarshipName} Anda memerlukan revisi`;
    if (friendlyRoleName) {
        message += ` dari ${friendlyRoleName}`;
    }
    message += ".";
    if (revisionNotes) {
        message += ` Catatan: ${revisionNotes}`;
    }

    return await createNotification({
        userId: applicantUserId,
        title: "Perlu Revisi",
        message,
        type: "APPLICATION_REVISION",
        entityId: applicationId,
        letterInstanceId: applicationId,
    });
}

/**
 * Notify specific role about revision request (from higher role to lower role)
 * e.g., WD1 -> TU, WD1 -> SPV, TU -> SPV
 */
export async function notifyRevisionToRole(params: {
    targetUserIds: string[];
    applicationId: string;
    scholarshipName: string;
    applicantName: string;
    requestedByRole: string;
    targetRole: string;
    revisionNotes?: string;
}) {
    const {
        targetUserIds,
        applicationId,
        scholarshipName,
        applicantName,
        requestedByRole,
        targetRole,
        revisionNotes,
    } = params;

    const friendlyRequestedByRole = formatRoleName(requestedByRole);
    const friendlyTargetRole = formatRoleName(targetRole);

    const message = revisionNotes
        ? `Surat rekomendasi beasiswa ${scholarshipName} dari ${applicantName} memerlukan revisi dari Anda. Diminta oleh ${friendlyRequestedByRole}. Catatan: ${revisionNotes}`
        : `Surat rekomendasi beasiswa ${scholarshipName} dari ${applicantName} memerlukan revisi dari Anda. Diminta oleh ${friendlyRequestedByRole}.`;

    const notifications = await Promise.all(
        targetUserIds.map((userId) =>
            createNotification({
                userId,
                title: `Revisi Diperlukan`,
                message,
                type: "APPLICATION_REVISION",
                entityId: applicationId,
                letterInstanceId: applicationId,
            }),
        ),
    );

    return notifications;
}

/**
 * Notify applicant about application published
 */
export async function notifyApplicationPublished(params: {
    applicantUserId: string;
    applicationId: string;
    scholarshipName: string;
}) {
    const { applicantUserId, applicationId, scholarshipName } = params;

    return await createNotification({
        userId: applicantUserId,
        title: "Surat Terbit!",
        message: `Selamat! Surat rekomendasi beasiswa ${scholarshipName} Anda telah terbit dan siap diunduh. Silakan cek halaman detail untuk mengunduh surat.`,
        type: "APPLICATION_PUBLISHED",
        entityId: applicationId,
        letterInstanceId: applicationId,
    });
}

/**
 * Notify applicant about approval progress (optional - to keep student informed)
 */
export async function notifyApprovalProgress(params: {
    applicantUserId: string;
    applicationId: string;
    scholarshipName: string;
    approvedByRole: string;
    nextRole?: string;
}) {
    const { applicantUserId, applicationId, scholarshipName, approvedByRole, nextRole } = params;

    const friendlyApprovedBy = formatRoleName(approvedByRole);
    const friendlyNextRole = formatRoleName(nextRole);

    let message = `Pengajuan surat rekomendasi beasiswa ${scholarshipName} Anda telah disetujui oleh ${friendlyApprovedBy}`;
    if (friendlyNextRole && nextRole) {
        message += ` dan sedang menunggu persetujuan dari ${friendlyNextRole}.`;
    } else {
        message += ".";
    }

    return await createNotification({
        userId: applicantUserId,
        title: "Pengajuan Disetujui",
        message,
        type: "APPLICATION_APPROVED",
        entityId: applicationId,
        letterInstanceId: applicationId,
    });
}

/**
 * Delete notification by id
 */
export async function deleteNotification(
    notificationId: string,
    userId: string,
) {
    return await Prisma.notification.deleteMany({
        where: { id: notificationId, userId },
    });
}

/**
 * Delete all notifications for user
 */
export async function deleteAllNotifications(userId: string) {
    return await Prisma.notification.deleteMany({
        where: { userId },
    });
}
