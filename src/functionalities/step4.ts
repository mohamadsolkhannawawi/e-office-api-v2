// Functionality for Step 4: Confirmation modal and submit process

export interface Step4State {
    showModal: boolean;
    loading: boolean;
    buttonDisabled: boolean;
    submitted: boolean;
}

export function openConfirmationModal(): Step4State {
    return {
        showModal: true,
        loading: false,
        buttonDisabled: false,
        submitted: false,
    };
}

export function closeConfirmationModal(state: Step4State): Step4State {
    return { ...state, showModal: false };
}

export async function onSubmitConfirmation(
    state: Step4State,
    confirm: boolean
): Promise<Step4State> {
    if (!confirm) {
        return { ...state, showModal: false };
    }
    // Start loading and disable button
    let newState = { ...state, loading: true, buttonDisabled: true };
    // Simulate async submit process (replace with real API call)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // After submit
    newState = {
        ...newState,
        loading: false,
        buttonDisabled: false,
        submitted: true,
        showModal: false,
    };
    return newState;
}

// Usage example:
// let state = openConfirmationModal();
// if user clicks "Batal" => state = closeConfirmationModal(state)
// if user clicks "Ya, Ajukan" => state = await onSubmitConfirmation(state, true)
