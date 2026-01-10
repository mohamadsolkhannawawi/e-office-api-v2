// Validation placeholder for Departemen
export function validateDepartemen(value: unknown) {
    const errors: string[] = [];
    let parsed = "";
    if (typeof value === "string") {
        parsed = value.trim();
    } else if (value != null) {
        parsed = String(value).trim();
    }
    if (parsed === "") {
        errors.push("Departemen harus valid dan tidak boleh kosong");
    }
    return { valid: errors.length === 0, errors };
}
