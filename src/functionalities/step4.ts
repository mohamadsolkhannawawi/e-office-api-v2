// Functionality for Step 4: Confirmation modal before submitting the letter

export interface Step4State {
    showModal: boolean;
}

export function openConfirmationModal(): Step4State {
    return { showModal: true };
}

export function closeConfirmationModal(): Step4State {
    return { showModal: false };
}

export function onSubmitConfirmation(confirm: boolean) {
    if (confirm) {
        // TODO: Submit surat to backend or database
        return { submitted: true };
    }
    return { submitted: false };
}

// Usage example:
// const modal = openConfirmationModal();
// if user clicks "Batal" => closeConfirmationModal()
// if user clicks "Ya, Ajukan" => onSubmitConfirmation(true)
