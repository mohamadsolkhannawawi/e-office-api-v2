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
    letterInstanceId?: string; // 🔴 TAMBAHAN
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
 */
export async function notifyApplicationStatusChange(params: {
    applicationId: string;
    applicantUserId: string;
    scholarshipName: string;
    newStatus: string;
    actorName?: string;
}) {
    const {
        applicationId,
        applicantUserId,
        scholarshipName,
        newStatus,
        actorName,
    } = params;

    let title = "";
    let message = "";
    let type: NotificationType = "APPLICATION_APPROVED";

    switch (newStatus) {
        case "APPROVED":
        case "IN_PROGRESS":
            title = "Pengajuan Disetujui";
            message = `Pengajuan ${scholarshipName} Anda telah disetujui${actorName ? ` oleh ${actorName}` : ""}.`;
            type = "APPLICATION_APPROVED";
            break;
        case "REJECTED":
            title = "Pengajuan Ditolak";
            message = `Pengajuan ${scholarshipName} Anda ditolak${actorName ? ` oleh ${actorName}` : ""}.`;
            type = "APPLICATION_REJECTED";
            break;
        case "REVISION":
            title = "Perlu Revisi";
            message = `Pengajuan ${scholarshipName} Anda memerlukan revisi.`;
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
        letterInstanceId: applicationId, // 🔴 TAMBAHAN
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
}) {
    const { reviewerUserIds, applicationId, scholarshipName, applicantName } =
        params;

    const notifications = await Promise.all(
        reviewerUserIds.map((userId) =>
            createNotification({
                userId,
                title: "Pengajuan Baru",
                message: `Pengajuan ${scholarshipName} dari ${applicantName} memerlukan persetujuan Anda.`,
                type: "NEW_TASK",
                entityId: applicationId,
                letterInstanceId: applicationId, // 🔴 TAMBAHAN
            }),
        ),
    );

    return notifications;
}

/**
 * Notify supervisor about new application submission
 */
export async function notifyApplicationSubmitted(params: {
    supervisorUserIds: string[];
    applicationId: string;
    scholarshipName: string;
    applicantName: string;
}) {
    const { supervisorUserIds, applicationId, scholarshipName, applicantName } =
        params;

    console.log("🔔 [notifyApplicationSubmitted] Called with:", {
        supervisorUserIds,
        supervisorCount: supervisorUserIds.length,
        applicationId,
        scholarshipName,
        applicantName,
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

        const notifications = await Promise.all(
            supervisorUserIds.map((userId, index) => {
                console.log(
                    `🔔 [notifyApplicationSubmitted] [${index + 1}/${supervisorUserIds.length}] Creating for user: ${userId}`,
                );
                return createNotification({
                    userId,
                    title: "Pengajuan Baru Masuk",
                    message: `${applicantName} telah mengajukan surat rekomendasi beasiswa ${scholarshipName}. Silakan tinjau dan berikan persetujuan.`,
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
 * Notify next role about application ready for review
 */
export async function notifyApplicationReadyForReview(params: {
    nextRoleUserIds: string[];
    applicationId: string;
    scholarshipName: string;
    applicantName: string;
    currentRoleName: string;
}) {
    const {
        nextRoleUserIds,
        applicationId,
        scholarshipName,
        applicantName,
        currentRoleName,
    } = params;

    const notifications = await Promise.all(
        nextRoleUserIds.map((userId) =>
            createNotification({
                userId,
                title: "Surat Menunggu Persetujuan",
                message: `Surat rekomendasi beasiswa ${scholarshipName} dari ${applicantName} sudah disetujui oleh ${currentRoleName} dan menunggu persetujuan Anda.`,
                type: "NEW_TASK",
                entityId: applicationId,
                letterInstanceId: applicationId, // 🔴 TAMBAHAN
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

    return await createNotification({
        userId: applicantUserId,
        title: "Pengajuan Ditolak",
        message: `Pengajuan ${scholarshipName} Anda telah ditolak${rejectedByRole ? ` oleh ${rejectedByRole}` : ""}. ${rejectionReason ? `Alasan: ${rejectionReason}` : ""}`,
        type: "APPLICATION_REJECTED",
        entityId: applicationId,
        letterInstanceId: applicationId, // 🔴 TAMBAHAN
    });
}

/**
 * Notify applicant about revision request
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

    return await createNotification({
        userId: applicantUserId,
        title: "Perlu Revisi",
        message: `Pengajuan ${scholarshipName} Anda memerlukan revisi${requestedByRole ? ` dari ${requestedByRole}` : ""}. ${revisionNotes ? `Catatan: ${revisionNotes}` : ""}`,
        type: "APPLICATION_REVISION",
        entityId: applicationId,
        letterInstanceId: applicationId, // 🔴 TAMBAHAN
    });
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
        message: `Selamat! Surat rekomendasi beasiswa ${scholarshipName} telah terbit dan siap Anda unduh.`,
        type: "APPLICATION_PUBLISHED",
        entityId: applicationId,
        letterInstanceId: applicationId, // 🔴 TAMBAHAN
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
