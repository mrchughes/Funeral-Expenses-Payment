// Form progress tracking utility
// Manages section completion status and validation

// FORM_SECTIONS removed. Use formSections from formStructure.js instead.

// Status types
export const STATUS = {
    NOT_STARTED: 'not-started',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed'
};

// Check if a section is completed based on required fields
export const getSectionStatus = (formData, section) => {
    // Accepts a section object from formSections
    const requiredFields = section.fields.map(f => (typeof f === 'string' ? f : f.name));
    const filledFields = requiredFields.filter(field => {
        const value = formData[field];
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        return value && value.toString().trim() !== '';
    });
    if (filledFields.length === 0) {
        return STATUS.NOT_STARTED;
    } else if (filledFields.length === requiredFields.length) {
        return STATUS.COMPLETED;
    } else {
        return STATUS.IN_PROGRESS;
    }
};

// Get status for all sections
// Accepts formSections array as argument
export const getAllSectionStatuses = (formData, formSections) => {
    const statuses = {};
    formSections.forEach(section => {
        statuses[section.id] = getSectionStatus(formData, section);
    });
    return statuses;
};

// Check if user has any progress (any field filled)
export const hasAnyProgress = (formData, formSections) => {
    if (!formData || typeof formData !== 'object') {
        return false;
    }
    const allFields = formSections.flatMap(section => section.fields.map(f => (typeof f === 'string' ? f : f.name)));
    return allFields.some(field => {
        const value = formData[field];
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        return value && value.toString().trim() !== '';
    });
};

// Get overall progress percentage
export const getOverallProgress = (formData, formSections) => {
    const statuses = getAllSectionStatuses(formData, formSections);
    const completedSections = Object.values(statuses).filter(status => status === STATUS.COMPLETED).length;
    const totalSections = formSections.length;
    return Math.round((completedSections / totalSections) * 100);
};

// Save section completion status to localStorage
export const saveSectionProgress = (userId, sectionStatuses) => {
    if (!userId) return;

    try {
        const key = `funeral_form_sections_${userId}`;
        localStorage.setItem(key, JSON.stringify(sectionStatuses));
    } catch (error) {
        console.warn('Failed to save section progress:', error);
    }
};

// Load section completion status from localStorage
export const loadSectionProgress = (userId) => {
    if (!userId) return {};

    try {
        const key = `funeral_form_sections_${userId}`;
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : {};
    } catch (error) {
        console.warn('Failed to load section progress:', error);
        return {};
    }
};

// Clear section progress from localStorage
export const clearSectionProgress = (userId) => {
    if (!userId) return;

    try {
        const key = `funeral_form_sections_${userId}`;
        localStorage.removeItem(key);
    } catch (error) {
        console.warn('Failed to clear section progress:', error);
    }
};

// Get section by step number (1-based)
export const getSectionByStep = (stepNumber, formSections) => {
    return formSections[stepNumber - 1];
};

// Get section by ID
export const getSectionById = (sectionId, formSections) => {
    return formSections.find(section => section.id === sectionId);
};
