// Functionality for Step 1: validation and transition to step 2

import {
    validateNamaLengkap,
    validateRole,
    validateNIM,
    validateEmail,
    validateDepartemen,
    validateProgramStudi,
    validateTempatLahir,
    validateTanggalLahir,
    validateNoHp,
    validateIPK,
    validateIPS,
} from "../validations/surat-rekomendasi/index.js";

export interface Step1Data {
    namaLengkap: unknown;
    role: unknown;
    nim: unknown;
    email: unknown;
    departemen: unknown;
    programStudi: unknown;
    tempatLahir: unknown;
    tanggalLahir: unknown;
    noHp: unknown;
    ipk: unknown;
    ips: unknown;
}

export function validateStep1(data: Step1Data) {
    const results = {
        namaLengkap: validateNamaLengkap(data.namaLengkap),
        role: validateRole(data.role),
        nim: validateNIM(data.nim),
        email: validateEmail(data.email),
        departemen: validateDepartemen(data.departemen),
        programStudi: validateProgramStudi(data.programStudi),
        tempatLahir: validateTempatLahir(data.tempatLahir),
        tanggalLahir: validateTanggalLahir(data.tanggalLahir),
        noHp: validateNoHp(data.noHp),
        ipk: validateIPK(data.ipk),
        ips: validateIPS(data.ips),
    };
    const allValid = Object.values(results).every((r) => r.valid);
    return { valid: allValid, results };
}

export function onStep1Submit(data: Step1Data) {
    const validation = validateStep1(data);
    if (!validation.valid) {
        return { success: false, errors: validation.results };
    }
    // TODO: Save data to database or session here
    // TODO: Redirect to step 2 (handled in controller or route)
    return { success: true };
}
