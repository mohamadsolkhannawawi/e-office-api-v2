import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";

/**
 * Letter Config Routes
 * Mengelola konfigurasi dinamis untuk template surat (pejabat, kop surat, dll)
 */
const letterConfigRoutes = new Elysia({
    prefix: "/letter-config",
    tags: ["master", "letter-config"],
})
    /**
     * Get all active letter configs
     */
    .get("/", async () => {
        const configs = await Prisma.letterConfig.findMany({
            where: { isActive: true },
            orderBy: { key: "asc" },
        });
        return configs;
    })

    /**
     * Get letter config by key
     */
    .get(
        "/:key",
        async ({ params }) => {
            const config = await Prisma.letterConfig.findUnique({
                where: { key: params.key },
            });

            if (!config) {
                throw new Error(`Config with key '${params.key}' not found`);
            }

            return config;
        },
        {
            params: t.Object({
                key: t.String(),
            }),
        },
    )

    /**
     * Update letter config (creates new version)
     */
    .put(
        "/:key",
        async ({ params, body }) => {
            const existing = await Prisma.letterConfig.findUnique({
                where: { key: params.key },
            });

            if (!existing) {
                // Create new config
                const newConfig = await Prisma.letterConfig.create({
                    data: {
                        key: params.key,
                        value: body.value,
                        version: 1,
                        isActive: true,
                    },
                });
                return newConfig;
            }

            // Update existing - increment version
            const updated = await Prisma.letterConfig.update({
                where: { key: params.key },
                data: {
                    value: body.value,
                    version: existing.version + 1,
                },
            });

            return updated;
        },
        {
            params: t.Object({
                key: t.String(),
            }),
            body: t.Object({
                value: t.Any(), // JSON object
            }),
        },
    )

    /**
     * Get config history (all versions)
     * Note: Current implementation only keeps latest version.
     * For full history, we'd need a separate LetterConfigHistory table.
     */
    .get(
        "/:key/history",
        async ({ params }) => {
            const config = await Prisma.letterConfig.findUnique({
                where: { key: params.key },
            });

            if (!config) {
                throw new Error(`Config with key '${params.key}' not found`);
            }

            // Return current config with version info
            return {
                currentVersion: config.version,
                config: config,
                note: "Untuk riwayat lengkap, diperlukan tabel LetterConfigHistory terpisah.",
            };
        },
        {
            params: t.Object({
                key: t.String(),
            }),
        },
    );

export default letterConfigRoutes;
