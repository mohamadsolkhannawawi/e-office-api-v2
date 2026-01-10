// Functionality for Step 3: Lampiran Tambahan (optional, max 3 files)

import { validateLampiranTambahan } from "../validations/surat-rekomendasi/index.js";

export interface Step3Data {
    lampiranTambahan: unknown[]; // Array of file or file metadata
}

export function validateStep3(data: Step3Data) {
    const errors: string[] = [];
    if (Array.isArray(data.lampiranTambahan)) {
        if (data.lampiranTambahan.length === 0) {
            errors.push("Minimal 1 lampiran wajib");
        }
        if (data.lampiranTambahan.length > 3) {
            errors.push("Lampiran tambahan maksimal 3 file");
        }
        // Optionally validate each file if needed
        data.lampiranTambahan.forEach((item, idx) => {
            const result = validateLampiranTambahan(item);
            if (!result.valid) {
                errors.push(
                    `Lampiran tambahan ke-${idx + 1}: ${result.errors.join(
                        ", "
                    )}`
                );
            }
        });
        // Check at least one has kategori
        const hasKategori = data.lampiranTambahan.some(
            (item) =>
                item &&
                typeof item === "object" &&
                "kategori" in item &&
                item.kategori
        );
        if (!hasKategori) {
            errors.push("Minimal 1 lampiran wajib memiliki kategori");
        }
    } else {
        errors.push("Minimal 1 lampiran wajib");
    }
    return { valid: errors.length === 0, errors };
}

export function onStep3Submit(data: Step3Data) {
    const validation = validateStep3(data);
    if (!validation.valid) {
        return { success: false, errors: validation.errors };
    }
    // TODO: Save data to database or session here
    // TODO: Redirect to next step or finish (handled in controller or route)
    return { success: true };
}
