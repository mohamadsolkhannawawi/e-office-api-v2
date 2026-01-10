// Validation placeholder for Nama Lengkap
export function validateNamaLengkap(value: unknown) {
    const errors: string[] = [];
    if (typeof value !== "string" || value.trim() === "") {
        errors.push("Nama lengkap harus valid dan tidak boleh kosong");
    }
    return { valid: errors.length === 0, errors };
}
