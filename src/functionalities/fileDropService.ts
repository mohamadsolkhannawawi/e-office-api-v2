import { validateLampiranUtama } from "../validations/surat-rekomendasi/lampiranUtama.js";
import { validateLampiranTambahan } from "../validations/surat-rekomendasi/lampiranTambahan.js";

type DroppedFile = {
    name: string;
    size: number;
    type?: string;
    // any other fields from client file object
};

type ValidateTarget = "utama" | "tambahan";

// Result returned after validation and normalization
export type FileDropResult = {
    valid: boolean;
    errors: string[];
    acceptedFiles: DroppedFile[];
};

/**
 * Handle dropped files for either `utama` or `tambahan` areas.
 * - normalizes File-like objects into minimal shape
 * - runs the corresponding validation function
 * - returns validation result and accepted files (unchanged order)
 */
export function handleDroppedFiles(files: File[] | DroppedFile[], target: ValidateTarget): FileDropResult {
    const normalized: DroppedFile[] = (files || []).map((f: any) => ({
        name: typeof f.name === "string" ? f.name : String(f?.filename ?? ""),
        size: typeof f.size === "number" ? f.size : Number(f?.fileSize ?? NaN),
        type: typeof f.type === "string" ? f.type : (f?.mime || ""),
    }));

    const validationInput = normalized.map(f => ({ name: f.name, size: f.size, type: f.type }));

    const result = target === "utama"
        ? validateLampiranUtama(validationInput as unknown)
        : validateLampiranTambahan(validationInput as unknown);

    // result has shape { valid: boolean, errors: string[] }
    return {
        valid: !!(result as any).valid,
        errors: Array.isArray((result as any).errors) ? (result as any).errors : [],
        acceptedFiles: normalized,
    };
}

export default { handleDroppedFiles };
