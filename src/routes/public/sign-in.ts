import { auth } from "@backend/lib/auth.ts";
import { Elysia, t } from "elysia";

/**
 * [ROUTE] Public Sign-In Route
 *
 * Signs in a user using Better Auth email/password flow.
 */
export default new Elysia().post(
  "/",
  async ({ body, headers }) => {
    const data = await auth.api.signInEmail({
      body: {
        email: body.username, // required
        password: body.password, // required
        rememberMe: true,
      },
      // This endpoint requires session cookies.
      headers: headers,
    });

    return data;
  },
  {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    }),
  },
);
