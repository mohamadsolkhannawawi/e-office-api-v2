import { auth } from "@backend/lib/auth.ts";
import { Elysia, t } from "elysia";

/**
 * [ROUTE] Public Register Route
 *
 * Registers a user using Better Auth email/password flow.
 */
export default new Elysia().post(
  "/",
  async ({ body, headers }) => {
    const data = await auth.api.signUpEmail({
      body: {
        name: body.name,
        email: body.username,
        password: body.password,
        rememberMe: true,
      },
      headers: headers,
    });

    return data;
  },
  {
    body: t.Object({
      name: t.String(),
      username: t.String(),
      password: t.String(),
    }),
  },
);
