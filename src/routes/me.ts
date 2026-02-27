import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia, t } from "elysia";
import { Prisma } from "../db/index.ts";
import { MinioService } from "../shared/services/minio.service.ts";

const db = Prisma;

export default new Elysia()
    .use(authGuardPlugin)
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
    .put(
        "/",
        async ({ user, set, body }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            try {
                // Update user data
                const updateData: any = {
                    name: body.name,
                };

                // Handle image update if provided
                if (body.image) {
                    updateData.image = body.image;
                }

                const updatedUser = await db.user.update({
                    where: { id: user.id },
                    data: updateData,
                });

                // Update phone number based on role (mahasiswa or pegawai)
                if (body.noHp) {
                    const mahasiswa = await db.mahasiswa.findUnique({
                        where: { userId: user.id },
                    });

                    if (mahasiswa) {
                        await db.mahasiswa.update({
                            where: { userId: user.id },
                            data: { noHp: body.noHp },
                        });
                    } else {
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
                name: t.String({ minLength: 1 }),
                noHp: t.Optional(t.String()),
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
