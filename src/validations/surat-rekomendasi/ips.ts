// Validation placeholder for IPS
export function validateIPS(value: unknown) {
    const errors: string[] = [];
    let ipsNum: number | null = null;
    if (typeof value === "number") {
        ipsNum = value;
    } else if (typeof value === "string") {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
            ipsNum = parsed;
        }
    }
    if (ipsNum === null || ipsNum < 0 || ipsNum > 4) {
        errors.push("IPS harus antara 0.00 - 4.00");
    }
    return { valid: errors.length === 0, errors };
}
