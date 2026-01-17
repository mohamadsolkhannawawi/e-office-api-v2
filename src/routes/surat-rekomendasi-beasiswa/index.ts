/**
 * Aggregator untuk semua routes Surat Rekomendasi Beasiswa
 * Mengabungkan routes dari semua role
 */
import { Elysia } from "elysia";
import mahasiswaRoutes from "./mahasiswa/index.ts";
import supervisorRoutes from "./supervisor/index.ts";
import manajerTURoutes from "./manajer-tu/index.ts";
import wakilDekanRoutes from "./wakil-dekan/index.ts";
import upaRoutes from "./upa/index.ts";

export const suratRekomendasiBeasiswaRoutes = new Elysia({
    prefix: "/surat-rekomendasi-beasiswa",
    tags: ["surat-rekomendasi-beasiswa"],
})
    .use(mahasiswaRoutes)
    .use(supervisorRoutes)
    .use(manajerTURoutes)
    .use(wakilDekanRoutes)
    .use(upaRoutes);

export default suratRekomendasiBeasiswaRoutes;

// Re-export individual routes for flexibility
export {
    mahasiswaRoutes,
    supervisorRoutes,
    manajerTURoutes,
    wakilDekanRoutes,
    upaRoutes,
};
