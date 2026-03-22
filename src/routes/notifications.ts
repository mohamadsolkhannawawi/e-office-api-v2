import { Elysia, t } from "elysia";
import { auth } from "@backend/lib/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  createNotification,
} from "@backend/services/notification.service.ts";

/**
 * Route Notifikasi
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
   * Ambil notifikasi untuk user saat ini
   */
  .get(
    "/",
    async ({ user, query }) => {
      if (!user) {
        console.error("❌ No user in GET /notifications");
        throw new Error("Unauthorized");
      }

      console.log("📥 GET /notifications - User:", user.email);
      const notifications = await getNotifications(user.id, {
        limit: query?.limit ? parseInt(query.limit) : 20,
        unreadOnly: query?.unreadOnly === "true",
      });

      console.log("📥 Found notifications:", notifications.length);
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
   * Ambil jumlah notifikasi belum dibaca
   */
  .get("/count", async ({ user }) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    const count = await getUnreadCount(user.id);
    return { data: { unread: count } };
  })

  /**
   * Tandai notifikasi sebagai sudah dibaca
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
   * Tandai semua notifikasi sebagai sudah dibaca
   */
  .patch("/read-all", async ({ user }) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    await markAllAsRead(user.id);
    return { success: true };
  })

  /**
   * Hapus notifikasi berdasarkan id
   */
  .delete(
    "/:id",
    async ({ user, params }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      await deleteNotification(params.id, user.id);
      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  )

  /**
   * Hapus semua notifikasi untuk user
   */
  .delete("/delete-all", async ({ user }) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    await deleteAllNotifications(user.id);
    return { success: true };
  })

  /**
   * DEBUG: Cek user SUPERVISOR di database
   */
  .get("/debug/supervisors", async () => {
    try {
      const supervisors = await Prisma.userRole.findMany({
        where: {
          role: { name: "SUPERVISOR" },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      return {
        supervisorsCount: supervisors.length,
        supervisors: supervisors.map((s) => ({
          userId: s.user.id,
          email: s.user.email,
          name: s.user.name,
          role: s.role.name,
        })),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  /**
   * DEBUG: Cek semua notifikasi di database
   */
  .get("/debug/all", async () => {
    try {
      const notifications = await Prisma.notification.findMany({
        take: 50,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

      return {
        count: notifications.length,
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          userEmail: n.user.email,
          isRead: n.isRead,
          createdAt: n.createdAt,
        })),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  /**
   * DEBUG: Uji pembuatan notifikasi
   */
  .post(
    "/debug/test-create",
    async ({ body }) => {
      try {
        const { userId, title, message, type } = body;

        console.log("🧪 Testing notification creation with:", {
          userId,
          title,
          message,
          type,
        });

        const notification = await createNotification({
          userId,
          title: title || "Test Notification",
          message: message || "This is a test notification",
          type: (type as any) || "NEW_TASK",
        });

        return {
          success: true,
          notification: {
            id: notification.id,
            userId: notification.userId,
            title: notification.title,
            type: notification.type,
            createdAt: notification.createdAt,
          },
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        title: t.Optional(t.String()),
        message: t.Optional(t.String()),
        type: t.Optional(t.String()),
      }),
    },
  );

export default notificationRoutes;
