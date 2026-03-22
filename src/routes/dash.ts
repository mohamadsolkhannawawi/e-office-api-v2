import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia } from "elysia";

/**
 * [ROUTE] Dash Route
 * Endpoint sederhana untuk mengembalikan konteks user terautentikasi.
 */
export default new Elysia().use(authGuardPlugin).get(
  "/",
  async ({ user }) => {
    console.log(user);
    return user;
  },
  {},
);
