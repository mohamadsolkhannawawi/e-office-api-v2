import {
    authGuardPlugin,
    requirePermission,
} from "@backend/middlewares/auth.ts";
import { MahasiswaService } from "@backend/services/database_models/mahasiswa.service.ts";
import { UserService } from "@backend/services/database_models/user.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
    .use(authGuardPlugin)
    .get(
        "/all",
        async () => {
            MahasiswaService.getAll();
            return;
        },
        {
            ...requirePermission("mahasiswa", "read"),
            body: t.Object({}),
        },
    )
    .get(
        "/:id",
        async ({ params: { id } }) => {
            return MahasiswaService.get(id);
        },
        {
            ...requirePermission("mahasiswa", "read"),
            body: t.Object({}),
        },
    )
    .post(
        "/",
        async ({
            body: {
                name,
                email,
                noHp,
                nim,
                tahunMasuk,
                alamat,
                tempatLahir,
                departemenId,
                programStudiId,
            },
        }) => {
            const user = await UserService.create({
                name: name,
                email: email,
            });

            const mahasiswa = await MahasiswaService.create({
                userId: user.id,
                noHp: noHp,
                nim: nim,
                tahunMasuk: tahunMasuk,
                alamat: alamat,
                tempatLahir: tempatLahir,
                departemenId: departemenId,
                programStudiId: programStudiId,
            });

            return {
                message: "Mahasiswa created successfully",
                mahasiswa,
            };
        },
        {
            ...requirePermission("mahasiswa", "create"),
            body: t.Object({
                name: t.String({ minLength: 3 }),
                email: t.String({ format: "email" }),
                noHp: t.String({ pattern: "^08[0-9]{8,13}$" }),
                nim: t.String({ pattern: "^[0-9]{14}$" }),
                tahunMasuk: t.String({ pattern: "^[0-9]{4}$" }),
                alamat: t.String({ minLength: 5 }),
                tempatLahir: t.String(),
                tanggalLahir: t.String(), // Could use format: 'date' if inputs are ISO strings
                departemenId: t.String(),
                programStudiId: t.String(),
            }),
        },
    )
    .patch(
        "/",
        async ({
            body: {
                id,
                noHp,
                nim,
                tahunMasuk,
                alamat,
                tempatLahir,
                departemenId,
                programStudiId,
            },
        }) => {
            const mahasiswa = await MahasiswaService.update(id, {
                noHp: noHp,
                nim: nim,
                tahunMasuk: tahunMasuk,
                alamat: alamat,
                tempatLahir: tempatLahir,
                departemenId: departemenId,
                programStudiId: programStudiId,
            });

            return {
                message: "Mahasiswa update successfully",
                mahasiswa,
            };
        },
        {
            ...requirePermission("mahasiswa", "write"),
            body: t.Object({
                id: t.String(),
                noHp: t.Optional(t.String({ pattern: "^08[0-9]{8,13}$" })),
                nim: t.Optional(t.String({ pattern: "^[0-9]{14}$" })),
                tahunMasuk: t.Optional(t.String({ pattern: "^[0-9]{4}$" })),
                alamat: t.Optional(t.String({ minLength: 5 })),
                tempatLahir: t.Optional(t.String()),
                tanggalLahir: t.Optional(t.String()),
                departemenId: t.Optional(t.String()),
                programStudiId: t.Optional(t.String()),
            }),
        },
    );
