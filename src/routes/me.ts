import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia, t } from "elysia";
import { Prisma } from "../db/index.ts";
import { MinioService } from "../shared/services/minio.service.ts";

const db = Prisma;

export default new Elysia()
    .use(authGuardPlugin)
    // Cek apakah profil user masih belum lengkap (data placeholder dari SSO auto-register)
    .get(
        "/profile-incomplete",
        async ({ user, set }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            const fullUser = await db.user.findUnique({
                where: { id: user.id },
                include: {
                    mahasiswa: true,
                    pegawai: true,
                    userRole: { include: { role: true } },
                },
            });

            if (!fullUser) {
                set.status = 404;
                return { error: "User not found" };
            }

            const roles = fullUser.userRole.map((ur) => ur.role.name);
            const isMahasiswa = roles.includes("MAHASISWA");
            const isPegawai = roles.some((r) =>
                ["SUPERVISOR", "MANAJER_TU", "WAKIL_DEKAN_1", "UPA"].includes(r),
            );

            const missingFields: string[] = [];

            if (isMahasiswa && fullUser.mahasiswa) {
                if (!fullUser.mahasiswa.noHp || fullUser.mahasiswa.noHp === "-")
                    missingFields.push("noHp");
                if (!fullUser.mahasiswa.tahunMasuk)
                    missingFields.push("tahunMasuk");
                // NIM placeholder = prefix email (bukan 14 digit angka)
                if (!/^\d{14}$/.test(fullUser.mahasiswa.nim))
                    missingFields.push("nim");
            }

            if (isPegawai && fullUser.pegawai) {
                if (!fullUser.pegawai.noHp || fullUser.pegawai.noHp === "-")
                    missingFields.push("noHp");
            }

            return {
                isIncomplete: missingFields.length > 0,
                missingFields,
                isMahasiswa,
                isPegawai,
                profile: {
                    mahasiswa: fullUser.mahasiswa,
                    pegawai: fullUser.pegawai,
                },
            };
        },
        {},
    )
    .get(
        "/",
        async ({ user, set }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            console.log(`>>> FETCHING ME FOR USER: ${user.id} (${user.email})`);
            const fullUser = await db.user.findUnique({
                where: { id: user.id },
                include: {
                    mahasiswa: {
                        include: {
                            departemen: true,
                            programStudi: true,
                        },
                    },
                    pegawai: {
                        include: {
                            departemen: true,
                            programStudi: true,
                        },
                    },
                    userRole: {
                        include: {
                            role: true,
                        },
                    },
                },
            });

            if (!fullUser) {
                console.log(`>>> USER NOT FOUND IN DB: ${user.id}`);
                set.status = 404;
                return { error: "User not found" };
            }

            console.log(">>> FULL USER DATA:", {
                id: fullUser.id,
                email: fullUser.email,
                hasMahasiswa: !!fullUser.mahasiswa,
                mahasiswaNim: fullUser.mahasiswa?.nim,
            });

            // Always rewrite image to proxy URL so clients never reference MinIO directly
            const imageUrl = fullUser.image ? "/api/me/photo" : null;

            return { ...fullUser, image: imageUrl };
        },
        {},
    )
    // GET /api/me/departments — daftar departemen+prodi untuk dropdown di modal SSO
    .get(
        "/departments",
        async ({ user, set }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }
            const departments = await db.departemen.findMany({
                include: {
                    programStudi: {
                        where: { deletedAt: null },
                        orderBy: { name: "asc" },
                    },
                },
                orderBy: { name: "asc" },
            });
            return { departments };
        },
        {},
    )
    // PUT /api/me/complete-profile — simpan semua data profil dari modal SSO pertama kali
    .put(
        "/complete-profile",
        async ({ user, set, body }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }
            try {
                if (body.name) {
                    await db.user.update({
                        where: { id: user.id },
                        data: { name: body.name },
                    });
                }

                const mahasiswa = await db.mahasiswa.findUnique({
                    where: { userId: user.id },
                });

                if (mahasiswa) {
                    // Validasi keunikan NIM jika berubah
                    if (body.nim && body.nim !== mahasiswa.nim) {
                        const nimConflict = await db.mahasiswa.findFirst({
                            where: {
                                nim: body.nim,
                                NOT: { userId: user.id },
                            },
                        });
                        if (nimConflict) {
                            set.status = 409;
                            return { error: "NIM sudah terdaftar untuk mahasiswa lain." };
                        }
                    }

                    const mhsData: Record<string, any> = {};
                    if (body.nim) mhsData.nim = body.nim;
                    if (body.noHp) mhsData.noHp = body.noHp;
                    if (body.tahunMasuk) mhsData.tahunMasuk = body.tahunMasuk;
                    if (body.departemenId) mhsData.departemenId = body.departemenId;
                    if (body.programStudiId) mhsData.programStudiId = body.programStudiId;

                    if (Object.keys(mhsData).length > 0) {
                        await db.mahasiswa.update({
                            where: { userId: user.id },
                            data: mhsData,
                        });
                    }
                } else {
                    const pegawai = await db.pegawai.findUnique({
                        where: { userId: user.id },
                    });
                    if (pegawai) {
                        const pgwData: Record<string, any> = {};
                        if (body.noHp) pgwData.noHp = body.noHp;
                        if (body.departemenId) pgwData.departemenId = body.departemenId;
                        if (body.programStudiId) pgwData.programStudiId = body.programStudiId;
                        if (Object.keys(pgwData).length > 0) {
                            await db.pegawai.update({
                                where: { userId: user.id },
                                data: pgwData,
                            });
                        }
                    }
                }

                return { success: true };
            } catch (error) {
                console.error("complete-profile error:", error);
                set.status = 500;
                return {
                    error: "Internal Server Error",
                    message: (error as Error).message,
                };
            }
        },
        {
            body: t.Object({
                name: t.Optional(t.String()),
                nim: t.Optional(t.String()),
                noHp: t.Optional(t.String()),
                tahunMasuk: t.Optional(t.String()),
                departemenId: t.Optional(t.String()),
                programStudiId: t.Optional(t.String()),
            }),
        },
    )
    .put(
        "/",
        async ({ user, set, body }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            try {
                // Update user data
                const updateData: any = {};
                if (body.name) updateData.name = body.name;
                if (body.image) updateData.image = body.image;

                const updatedUser =
                    Object.keys(updateData).length > 0
                        ? await db.user.update({
                              where: { id: user.id },
                              data: updateData,
                          })
                        : await db.user.findUnique({ where: { id: user.id } });

                // Update phone number / tahunMasuk based on role (mahasiswa or pegawai)
                if (body.noHp || body.tahunMasuk) {
                    const mahasiswa = await db.mahasiswa.findUnique({
                        where: { userId: user.id },
                    });

                    if (mahasiswa) {
                        const mhsData: Record<string, any> = {};
                        if (body.noHp) mhsData.noHp = body.noHp;
                        if (body.tahunMasuk) mhsData.tahunMasuk = body.tahunMasuk;
                        await db.mahasiswa.update({
                            where: { userId: user.id },
                            data: mhsData,
                        });
                    } else if (body.noHp) {
                        const pegawai = await db.pegawai.findUnique({
                            where: { userId: user.id },
                        });
                        if (pegawai) {
                            await db.pegawai.update({
                                where: { userId: user.id },
                                data: { noHp: body.noHp },
                            });
                        }
                    }
                }

                return { success: true, data: updatedUser };
            } catch (error) {
                console.error("Update profile error:", error);
                set.status = 500;
                return {
                    error: "Internal Server Error",
                    message: (error as Error).message,
                };
            }
        },
        {
            body: t.Object({
                name: t.Optional(t.String({ minLength: 1 })),
                noHp: t.Optional(t.String()),
                tahunMasuk: t.Optional(t.String()),
                image: t.Optional(t.String()),
            }),
        },
    )
    /**
     * Upload profile photo
     */
    .post(
        "/photo",
        async ({ user, body, set }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            try {
                let finalUrl = body.url;

                // If URL is a base64 data URL, convert and upload to MinIO
                if (body.url.startsWith("data:image")) {
                    try {
                        // Parse base64 data
                        const matches = body.url.match(
                            /^data:image\/(\w+);base64,(.+)$/,
                        );
                        if (!matches || !matches[2]) {
                            throw new Error("Invalid base64 image format");
                        }

                        const [, extension, base64Data] = matches;
                        const buffer = Buffer.from(base64Data, "base64");

                        // Create a File-like object for MinIO
                        const fileName = `profile_${user.id}_${Date.now()}.${extension}`;
                        const file = new File([buffer], fileName, {
                            type: `image/${extension}`,
                        });

                        // Upload to MinIO using static method
                        const uploadResult = await MinioService.uploadFile(
                            file,
                            "profiles/",
                            `image/${extension}`,
                        );
                        // Store the MinIO object path (not presigned URL) so proxy can serve it
                        finalUrl = "profiles/" + uploadResult.nameReplace;
                    } catch (uploadError) {
                        console.error(
                            "Failed to upload profile photo to MinIO:",
                            uploadError,
                        );
                        set.status = 500;
                        return {
                            error:
                                "Failed to upload profile photo: " +
                                (uploadError instanceof Error
                                    ? uploadError.message
                                    : "Unknown error"),
                        };
                    }
                }

                // Update user image field
                const updatedUser = await db.user.update({
                    where: { id: user.id },
                    data: { image: finalUrl },
                });

                // Return proxy URL so frontend immediately uses proxy
                const returnImage =
                    updatedUser.image && !updatedUser.image.startsWith("http")
                        ? "/api/me/photo"
                        : (updatedUser.image ?? null);

                return {
                    success: true,
                    data: {
                        image: returnImage,
                    },
                };
            } catch (error) {
                console.error("Upload profile photo error:", error);
                set.status = 500;
                return {
                    error: "Internal Server Error",
                    message: (error as Error).message,
                };
            }
        },
        {
            body: t.Object({
                url: t.String(), // Base64 data URL atau path ke file
            }),
        },
    )
    /**
     * Proxy endpoint to serve profile photo from MinIO
     */
    .get(
        "/photo",
        async ({ user, set }) => {
            if (!user) {
                set.status = 401;
                return new Response("Unauthorized", { status: 401 });
            }

            const dbUser = await db.user.findUnique({
                where: { id: user.id },
                select: { image: true },
            });

            if (!dbUser?.image) {
                set.status = 404;
                return new Response("No profile photo", { status: 404 });
            }

            // If the stored image is an old MinIO presigned/plain HTTP URL,
            // extract the object path so we can stream it directly (the stored
            // hostname may be unreachable from the client, e.g. localhost).
            let objectPath = dbUser.image;
            if (dbUser.image.startsWith("http")) {
                try {
                    const parsed = new URL(dbUser.image);
                    // pathname is "/<bucket>/<object_key...>" — drop leading "/"
                    // then strip the bucket name prefix
                    const parts = parsed.pathname.replace(/^\//, "").split("/");
                    // parts[0] = bucket name, rest = object key
                    if (parts.length >= 2) {
                        objectPath = parts.slice(1).join("/");
                        // Persist the cleaned-up path so future requests skip this step
                        await db.user.update({
                            where: { id: user.id },
                            data: { image: objectPath },
                        });
                    } else {
                        // Cannot parse — fall back to redirect
                        return Response.redirect(dbUser.image, 302);
                    }
                } catch {
                    return Response.redirect(dbUser.image, 302);
                }
            }

            try {
                const { stat, stream } =
                    await MinioService.getFileStream(objectPath);

                const webStream = new ReadableStream({
                    start(controller) {
                        stream.on("data", (chunk: Buffer) =>
                            controller.enqueue(chunk),
                        );
                        stream.on("end", () => controller.close());
                        stream.on("error", (err: Error) =>
                            controller.error(err),
                        );
                    },
                });

                const contentType =
                    stat.metaData?.["content-type"] || "image/jpeg";
                return new Response(webStream, {
                    status: 200,
                    headers: {
                        "Content-Type": contentType,
                        "Content-Length": String(stat.size),
                        "Cache-Control": "private, max-age=3600",
                    },
                });
            } catch (error) {
                console.error("Profile photo proxy error:", error);
                set.status = 404;
                return new Response("Photo not found", { status: 404 });
            }
        },
        {},
    );
