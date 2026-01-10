// Validation placeholder for Program Studi
export function validateProgramStudi(value: unknown) {
    const errors: string[] = [];
    let parsed = "";
    if (typeof value === "string") {
        parsed = value.trim();
    } else if (value != null) {
        parsed = String(value).trim();
    }
    if (parsed === "") {
        errors.push("Program Studi harus valid dan tidak boleh kosong");
    }
    return { valid: errors.length === 0, errors };
}
