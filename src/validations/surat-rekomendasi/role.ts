// Validation placeholder for Role
export function validateRole(value: unknown) {
    const errors: string[] = [];
    let parsed = "";
    if (typeof value === "string") {
        parsed = value.trim();
    } else if (value != null) {
        parsed = String(value).trim();
    }
    if (parsed === "") {
        errors.push("Role harus valid dan tidak boleh kosong");
    }
    return { valid: errors.length === 0, errors };
}
