/**
 * Role constants untuk API
 */
export const ROLES = {
    MAHASISWA: "MAHASISWA",
    SUPERVISOR_AKADEMIK: "SUPERVISOR_AKADEMIK",
    MANAJER_TU: "MANAJER_TU",
    WAKIL_DEKAN_1: "WAKIL_DEKAN_1",
    UPA: "UPA",
} as const;

export type RoleType = (typeof ROLES)[keyof typeof ROLES];

/**
 * Role hierarchy untuk permission checking
 */
export const ROLE_HIERARCHY: Record<RoleType, number> = {
    [ROLES.MAHASISWA]: 1,
    [ROLES.SUPERVISOR_AKADEMIK]: 2,
    [ROLES.MANAJER_TU]: 3,
    [ROLES.WAKIL_DEKAN_1]: 4,
    [ROLES.UPA]: 5,
};

/**
 * Workflow step untuk surat rekomendasi beasiswa
 */
export const BEASISWA_WORKFLOW_STEPS = {
    MAHASISWA_SUBMIT: 1,
    SUPERVISOR_VERIFY: 2,
    TU_PROCESS: 3,
    WAKIL_DEKAN_APPROVE: 4,
    COMPLETED: 5,
} as const;

/**
 * Status surat
 */
export const LETTER_STATUS = {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    REJECTED: "REJECTED",
} as const;
