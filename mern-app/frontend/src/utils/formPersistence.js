// Utility functions for persisting form data in localStorage

export const getFormStorageKey = (userId, suffix = '') => {
    return `formData_${userId || 'guest'}${suffix ? '_' + suffix : ''}`;
};

export const saveFormData = (userId, formData) => {
    try {
        localStorage.setItem(getFormStorageKey(userId), JSON.stringify(formData));
    } catch (error) {
        console.warn('Failed to save form data:', error);
    }
};

export const loadFormData = (userId, defaultData = {}) => {
    try {
        const saved = localStorage.getItem(getFormStorageKey(userId));
        if (saved) {
            const parsed = JSON.parse(saved);
            // Ensure benefitsReceived is always an array
            return {
                ...defaultData,
                ...parsed,
                benefitsReceived: parsed.benefitsReceived || []
            };
        }
    } catch (error) {
        console.warn('Failed to load saved form data:', error);
    }
    return defaultData;
};

export const saveFormStep = (userId, step) => {
    try {
        localStorage.setItem(getFormStorageKey(userId, 'step'), step.toString());
    } catch (error) {
        console.warn('Failed to save form step:', error);
    }
};

export const loadFormStep = (userId, defaultStep = 1) => {
    try {
        const saved = localStorage.getItem(getFormStorageKey(userId, 'step'));
        return saved ? parseInt(saved, 10) : defaultStep;
    } catch (error) {
        console.warn('Failed to load saved form step:', error);
        return defaultStep;
    }
};

export const clearFormData = (userId) => {
    try {
        localStorage.removeItem(getFormStorageKey(userId));
        localStorage.removeItem(getFormStorageKey(userId, 'step'));
    } catch (error) {
        console.warn('Failed to clear saved form data:', error);
    }
};

export const hasFormData = (userId) => {
    try {
        const saved = localStorage.getItem(getFormStorageKey(userId));
        return !!saved;
    } catch (error) {
        return false;
    }
};
