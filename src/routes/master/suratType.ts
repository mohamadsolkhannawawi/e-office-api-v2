import {
  authGuardPlugin,
  requirePermission,
} from "@backend/middlewares/auth.ts";
import { Elysia, t } from "elysia";
import { LetterTypeService } from "@backend/services/database_models/letterType.service.ts";

/**
 * [ROUTE] Letter Type Master Routes
 *
 * Provides list, detail, create, and update endpoints for letter types.
 */
export default new Elysia()
  .use(authGuardPlugin)
  .get(
    "/all",
    async () => {
      LetterTypeService.getAll();
      return;
    },
    {
      ...requirePermission("letterType", "create"),
      body: t.Object({}),
    },
  )
  .get(
    "/:id",
    async ({ params: { id } }) => {
      return LetterTypeService.get(id);
    },
    {
      ...requirePermission("letterType", "create"),
      body: t.Object({}),
    },
  )
  .post(
    "/",
    async ({ body: { name } }) => {
      const letter = await LetterTypeService.create({
        name: name,
      });

      return {
        message: "Letter Type created successfully",
        letter,
      };
    },
    {
      ...requirePermission("letterType", "create"),
      body: t.Object({
        name: t.String(),
      }),
    },
  )
  .patch(
    "/",
    async ({ body: { name, id } }) => {
      const letter = await LetterTypeService.update(id, {
        name: name,
      });

      return {
        message: "Letter Type updated successfully",
        letter,
      };
    },
    {
      ...requirePermission("letterType", "write"),
      body: t.Object({
        id: t.String(),
        name: t.Optional(t.String()),
      }),
    },
  );
