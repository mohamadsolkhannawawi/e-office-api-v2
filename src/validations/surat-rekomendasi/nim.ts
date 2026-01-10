// Validation placeholder for NIM
export function validateNIM(value: unknown) {
    const errors: string[] = [];
    const nimStr = typeof value === "string" ? value : String(value);
    // Check if numeric and length between 12 and 14
    if (!/^[0-9]{12,14}$/.test(nimStr)) {
        errors.push("NIM harus 12-14 digit angka");
    }
    return { valid: errors.length === 0, errors };
}
