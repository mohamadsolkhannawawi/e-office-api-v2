import { Prisma } from "@backend/db/index.ts";
import { config } from "@backend/config.ts";
import { Elysia } from "elysia";
import { randomBytes, createHmac } from "crypto";

export const ssoRoutes = new Elysia()
    .get("/auth/sso", async ({ headers, set, request }) => {
        const authHeader = headers.authorization;
        let ssoToken: string | undefined;

        if (authHeader?.startsWith("Bearer ")) {
            ssoToken = authHeader.slice(7);
        } else if (authHeader) {
            ssoToken = authHeader;
        }

        if (!ssoToken) {
            set.status = 400;
            return { message: "Token missing" };
        }

        // 2. Validasi token ke SSO Engine — TAMBAH prefix "Bearer " saat memanggil SSO
        let ssoUser: {
            id: string;
            name: string;
            username: string;
            role: string;
        };

        try {
            const ssoRes = await fetch(`${config.SSO_API_URL}/users/me`, {
                headers: { Authorization: `Bearer ${ssoToken}` },
            });

            if (!ssoRes.ok) {
                console.error(
                    `[SSO] /users/me returned ${ssoRes.status} for token`,
                );
                set.status = 401;
                return { message: "Invalid SSO token" };
            }

            const ssoData = (await ssoRes.json()) as { data: typeof ssoUser };
            ssoUser = ssoData.data;
        } catch (err) {
            console.error("[SSO] Failed to call SSO /users/me:", err);
            set.status = 401;
            return { message: "Invalid SSO token" };
        }

        // username di response SSO adalah email user
        const email = ssoUser?.username;
        if (!email || typeof email !== "string") {
            set.status = 401;
            return { message: "Invalid SSO token payload" };
        }

        // 3. Mapping SSO role ke DB role name
        // SSO role: "mahasiswa" | "lecturer" | "staff"
        const ssoRoleToDbRole: Record<string, string> = {
            mahasiswa: "MAHASISWA",
            lecturer: "SUPERVISOR",
            staff: "SUPERVISOR",
        };
        const targetRoleName = ssoRoleToDbRole[ssoUser.role] ?? null;

        const assignRoleAndProfile = async (userId: string) => {
            if (!targetRoleName) return;

            const existingRole = await Prisma.userRole.findFirst({
                where: {
                    userId,
                    role: { name: targetRoleName },
                },
            });

            if (!existingRole) {
                let dbRole = await Prisma.role.findUnique({
                    where: { name: targetRoleName },
                });
                if (!dbRole) {
                    dbRole = await Prisma.role.create({
                        data: { name: targetRoleName },
                    });
                    console.log(`[SSO] Created new role: ${targetRoleName}`);
                }
                await Prisma.userRole.create({
                    data: { userId, roleId: dbRole.id },
                });
                console.log(`[SSO] Assigned role ${targetRoleName} to user ${email}`);
            }

            const [defaultDept, defaultProdi] = await Promise.all([
                Prisma.departemen.findFirst(),
                Prisma.programStudi.findFirst(),
            ]);

            if (!defaultDept || !defaultProdi) return;

            if (ssoUser.role === "mahasiswa") {
                const existing = await Prisma.mahasiswa.findUnique({ where: { userId } });
                if (!existing) {
                    const nim = email.split("@")[0] ?? email;
                    await Prisma.mahasiswa.create({
                        data: {
                            userId,
                            nim,
                            tahunMasuk: new Date().getFullYear().toString(),
                            noHp: "-",
                            departemenId: defaultDept.id,
                            programStudiId: defaultProdi.id,
                        },
                    });
                    console.log(`[SSO] Created mahasiswa profile for ${email}`);
                }
            } else if (ssoUser.role === "lecturer" || ssoUser.role === "staff") {
                const existing = await Prisma.pegawai.findUnique({ where: { userId } });
                if (!existing) {
                    const nip = email.split("@")[0] ?? email;
                    await Prisma.pegawai.create({
                        data: {
                            userId,
                            nip,
                            jabatan: ssoUser.role === "lecturer" ? "Dosen" : "Staff",
                            noHp: "-",
                            departemenId: defaultDept.id,
                            programStudiId: defaultProdi.id,
                        },
                    });
                    console.log(`[SSO] Created pegawai profile for ${email}`);
                }
            }
        };

        // 4. Upsert user di database lokal
        try {
            let user = await Prisma.user.findUnique({
                where: { email },
                include: { userRole: { include: { role: true } } },
            });

            if (!user) {
                // Auto-register user baru dari SSO
                console.log(`[SSO] Registering new user: ${email}`);

                user = await Prisma.user.create({
                    data: {
                        name: ssoUser.name,
                        email,
                        emailVerified: true,
                        isActive: true,
                    },
                    include: { userRole: { include: { role: true } } },
                });

                await assignRoleAndProfile(user.id);

                // Reload user dengan relasi yang baru dibuat
                user = await Prisma.user.findUnique({
                    where: { id: user.id },
                    include: { userRole: { include: { role: true } } },
                });
            } else {
                if (!user.isActive) {
                    set.status = 403;
                    return {
                        message:
                            "Account has been deactivated. Please contact administrator.",
                    };
                }

                if (user.name !== ssoUser.name) {
                    await Prisma.user.update({
                        where: { id: user.id },
                        data: { name: ssoUser.name },
                    });
                }

                // Assign role & buat profil jika belum ada (untuk existing user tanpa role)
                await assignRoleAndProfile(user.id);

                // Reload agar userRole ter-update
                user = await Prisma.user.findUnique({
                    where: { id: user.id },
                    include: { userRole: { include: { role: true } } },
                });

                console.log(`[SSO] Existing user logged in: ${email}`);
            }

            if (!user) {
                set.status = 500;
                return { message: "Failed to create user account" };
            }

            // 4. Buat session yang kompatibel dengan Better Auth
            const sessionToken = randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

            await Prisma.session.create({
                data: {
                    id: randomBytes(16).toString("hex"),
                    token: sessionToken,
                    userId: user.id,
                    expiresAt,
                    ipAddress:
                        request.headers.get("x-forwarded-for") ??
                        request.headers.get("x-real-ip") ??
                        null,
                    userAgent: request.headers.get("user-agent") ?? null,
                },
            });

            console.log(
                `[SSO] Session created for user ${email}, token ready`,
            );

            // 5. Return callback_url — SSO concatenate ke application_url (frontend URL):
            return {
                callback_url: `/sso/callback?token=${sessionToken}`,
            };
        } catch (error) {
            console.error("[SSO] Error during user sync:", error);
            set.status = 500;
            return { message: "Internal server error" };
        }
    })

    // ─── SSO REDIRECT HANDLER ─────────────────────────────────────────────────
    .get("/auth/sso/redirect", ({ query, set }) => {
        const token = query.token as string | undefined;

        if (!token) {
            set.status = 400;
            return { message: "Token missing" };
        }

        const feUrl = config.FRONTEND_URL || "https://apps-fsm.undip.ac.id/persuratan-rekomendasi";
        set.status = 302;
        set.headers["Location"] = `${feUrl}/sso/callback?token=${encodeURIComponent(token)}`;
        return null;
    })

    // ─── SET SESSION COOKIE HANDLER ──────────────────────────────────────────
    .get("/api/auth/sso/set-session", async ({ query, set }) => {
        const token = query.token as string | undefined;

        if (!token) {
            set.status = 400;
            return { message: "Token missing" };
        }

        // Verifikasi token ada di DB dan belum expired
        const session = await Prisma.session.findFirst({
            where: {
                token,
                expiresAt: { gt: new Date() },
            },
            include: { user: true },
        });

        if (!session || !session.user.isActive) {
            set.status = 401;
            return { message: "Invalid or expired session token" };
        }

        const secret = process.env.BETTER_AUTH_SECRET!;
        const sigBytes = createHmac("sha256", secret).update(token).digest();
        const b64sig = Buffer.from(sigBytes).toString("base64");
        const signedToken = encodeURIComponent(`${token}.${b64sig}`);

        const isProd = process.env.NODE_ENV === "production";
        const maxAge = Math.floor(
            (session.expiresAt.getTime() - Date.now()) / 1000,
        );
        const secure = isProd ? "; Secure" : "";

        set.headers["Set-Cookie"] =
            `better-auth.session_token=${signedToken}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${maxAge}`;

        return { success: true };
    });
