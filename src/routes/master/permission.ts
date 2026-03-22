import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia } from "elysia";

/**
 * [ROUTE] Permission Master Routes
 *
 * Temporary endpoint for returning authenticated user context.
 */
export default new Elysia().use(authGuardPlugin).get(
  "/",
  async ({ user }) => {
    console.log(
      "[INFO] [permission] Returning authenticated user context",
      user,
    );
    return user;
  },
  {},
);
