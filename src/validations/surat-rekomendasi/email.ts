// Validation placeholder for Email
export function validateEmail(value: unknown) {
    const errors: string[] = [];
    const emailStr = typeof value === "string" ? value : String(value);
    // Simple email regex validation
    const emailRegex = /^[\w-.]+@[\w-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailStr)) {
        errors.push("Format email tidak valid");
    }
    return { valid: errors.length === 0, errors };
}
