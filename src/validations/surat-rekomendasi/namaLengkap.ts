// Validation placeholder for Nama Lengkap
export function validateNamaLengkap(value: unknown) {
    const errors: string[] = [];
    let parsed = "";
    if (typeof value === "string") {
        parsed = value.trim();
    } else if (value != null) {
        parsed = String(value).trim();
    }
    if (parsed === "") {
        errors.push("Nama lengkap harus valid dan tidak boleh kosong");
    }
    return { valid: errors.length === 0, errors };
}
