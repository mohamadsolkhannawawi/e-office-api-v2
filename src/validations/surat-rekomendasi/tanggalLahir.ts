// Validation placeholder for Tanggal Lahir
export function validateTanggalLahir(value: unknown) {
    const errors: string[] = [];
    let date: Date | null = null;
    if (value instanceof Date) {
        date = value;
    } else if (typeof value === "string") {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
            date = parsed;
        }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!date || date > today) {
        errors.push("Tanggal lahir tidak valid");
    }
    return { valid: errors.length === 0, errors };
}
