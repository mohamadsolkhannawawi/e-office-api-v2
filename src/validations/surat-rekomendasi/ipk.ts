// Validation placeholder for IPK
export function validateIPK(value: unknown) {
    const errors: string[] = [];
    let ipkNum: number | null = null;
    if (typeof value === "number") {
        ipkNum = value;
    } else if (typeof value === "string") {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
            ipkNum = parsed;
        }
    }
    if (ipkNum === null || ipkNum < 0 || ipkNum > 4) {
        errors.push("IPK harus antara 0.00 - 4.00");
    }
    return { valid: errors.length === 0, errors };
}
