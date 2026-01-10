// Functionality for Step 2: validation and transition to step 3

import { validateNamaBeasiswa } from "../validations/surat-rekomendasi/index.js";

export interface Step2Data {
    namaBeasiswa: unknown;
    // Add other fields as necessary
}

export function validateStep2(data: Step2Data) {
    const results = {
        namaBeasiswa: validateNamaBeasiswa(data.namaBeasiswa),
    };
    const allValid = Object.values(results).every((r) => r.valid);
    return { valid: allValid, results };
}

export function onStep2Submit(data: Step2Data) {
    const validation = validateStep2(data);
    if (!validation.valid) {
        return { success: false, errors: validation.results };
    }
    // TODO: Save data to database or session here
    // TODO: Redirect to step 3 (handled in controller or route)
    return { success: true };
}
