// Functionality for stepper navigation between steps

export interface StepperState {
    currentStep: number;
    data: Record<string, any>;
}

export function goToPreviousStep(state: StepperState) {
    if (state.currentStep > 1) {
        return {
            ...state,
            currentStep: state.currentStep - 1,
        };
    }
    return state;
}

export function goToNextStep(state: StepperState) {
    return {
        ...state,
        currentStep: state.currentStep + 1,
    };
}

// Example usage:
// const state = { currentStep: 2, data: { ... } };
// const newState = goToPreviousStep(state);
// // newState.currentStep === 1, data tetap ada
