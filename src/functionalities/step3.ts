// Functionality for Step 3: Lampiran Tambahan (optional, max 3 files)

import { validateLampiranTambahan } from "../validations/surat-rekomendasi/index.js";

export interface Step3Data {
    lampiranTambahan: unknown[]; // Array of file or file metadata
}

export function validateStep3(data: Step3Data) {
    const errors: string[] = [];
    if (Array.isArray(data.lampiranTambahan)) {
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
