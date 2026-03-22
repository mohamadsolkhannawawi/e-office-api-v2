import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia } from "elysia";

/**
 * [ROUTE] Pegawai Master Routes
 *
 * Temporary endpoint for returning authenticated user context.
 */
export default new Elysia().use(authGuardPlugin).get(
  "/",
  async ({ user }) => {
    console.log("[INFO] [pegawai] Returning authenticated user context", user);
    return user;
  },
  {},
);
