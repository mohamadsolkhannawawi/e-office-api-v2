export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateEmail(value: unknown): ValidationResult {
    const errors: string[] = [];
    const emailStr = typeof value === "string" ? value : String(value);
    const emailRegex = /^[\w-.]+@([\w-]+\.)+[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailStr)) {
        errors.push("Format email tidak valid");
    }
    return { valid: errors.length === 0, errors };
}