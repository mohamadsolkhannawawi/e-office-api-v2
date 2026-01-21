import { Elysia, t } from "elysia";
import { auth } from "@backend/lib/auth.ts";
import {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
} from "@backend/services/notification.service.ts";

/**
 * Notification Routes
 * API untuk mengelola notifikasi pengguna
 */
const notificationRoutes = new Elysia({
    prefix: "/notifications",
    tags: ["notifications"],
})
    .derive(async ({ headers }) => {
        const session = await auth.api.getSession({
            headers,
        });
        return {
            user: session?.user,
            session,
        };
    })

    /**
     * Get notifications for current user
     */
    .get(
        "/",
        async ({ user, query }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            const notifications = await getNotifications(user.id, {
                limit: query?.limit ? parseInt(query.limit) : 20,
                unreadOnly: query?.unreadOnly === "true",
            });

            return { data: notifications };
        },
        {
            query: t.Object({
                limit: t.Optional(t.String()),
                unreadOnly: t.Optional(t.String()),
            }),
        },
    )

    /**
     * Get unread notification count
     */
    .get("/count", async ({ user }) => {
        if (!user) {
            throw new Error("Unauthorized");
        }

        const count = await getUnreadCount(user.id);
        return { data: { unread: count } };
    })

    /**
     * Mark notification as read
     */
    .patch(
        "/:id/read",
        async ({ user, params }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            await markAsRead(params.id, user.id);
            return { success: true };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )

    /**
     * Mark all notifications as read
     */
    .patch("/read-all", async ({ user }) => {
        if (!user) {
            throw new Error("Unauthorized");
        }

        await markAllAsRead(user.id);
        return { success: true };
    });

export default notificationRoutes;
