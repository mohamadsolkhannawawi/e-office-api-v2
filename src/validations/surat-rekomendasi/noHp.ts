// Validation placeholder for No. HP
export function validateNoHp(value: unknown) {
    const errors: string[] = [];
    const hpStr = typeof value === "string" ? value : String(value);
    // Must start with 08, not +62, and be 10-13 digits
    if (!/^08[0-9]{8,11}$/.test(hpStr)) {
        errors.push("Format nomor HP tidak valid");
    }
    return { valid: errors.length === 0, errors };
}
