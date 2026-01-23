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
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams) {
    return await Prisma.notification.create({
        data: {
            userId: params.userId,
            title: params.title,
            message: params.message,
            type: params.type,
            entityId: params.entityId,
        },
    });
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
 * Notify users when application status changes
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
            }),
        ),
    );

    return notifications;
}
