// Validation: Nama Beasiswa is required at step 2.
export function validateNamaBeasiswa(value: unknown) {
    const errors: string[] = [];

    if (typeof value !== "string" || value.trim() === "") {
        errors.push("Nama beasiswa wajib diisi");
    }

    return { valid: errors.length === 0, errors };
}
