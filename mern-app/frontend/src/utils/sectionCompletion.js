// Utility functions for tracking section completion status

import { getFormStorageKey } from './formPersistence';
import { validateSection } from './validation';

const SECTION_COMPLETION_SUFFIX = 'sectionCompletion';

// Save section completion status
export const saveSectionCompletion = (userId, sectionId, isComplete) => {
    try {
        // Get existing completion data
        const storageKey = getFormStorageKey(userId, SECTION_COMPLETION_SUFFIX);
        const existingData = localStorage.getItem(storageKey);
        const completionData = existingData ? JSON.parse(existingData) : {};

        // Update the status for the specified section
        completionData[sectionId] = isComplete;

        // Save back to localStorage
        localStorage.setItem(storageKey, JSON.stringify(completionData));
        return true;
    } catch (error) {
        console.warn('Failed to save section completion status:', error);
        return false;
    }
};

// Load section completion status
export const loadSectionCompletion = (userId, defaultValue = {}) => {
    try {
        const storageKey = getFormStorageKey(userId, SECTION_COMPLETION_SUFFIX);
        const saved = localStorage.getItem(storageKey);
        return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
        console.warn('Failed to load section completion status:', error);
        return defaultValue;
    }
};

// Get completion status for a specific section
export const getSectionCompletion = (userId, sectionId) => {
    try {
        const completionData = loadSectionCompletion(userId, {});
        return completionData[sectionId] || false;
    } catch (error) {
        console.warn('Failed to get section completion status:', error);
        return false;
    }
};

// Clear all section completion data
export const clearSectionCompletion = (userId) => {
    try {
        const storageKey = getFormStorageKey(userId, SECTION_COMPLETION_SUFFIX);
        localStorage.removeItem(storageKey);
    } catch (error) {
        console.warn('Failed to clear section completion data:', error);
    }
};

// Check if a section can be marked as complete based on required fields
export const canMarkSectionComplete = (formData, section) => {
    const requiredFields = section.fields
        .filter(field => field.required !== false)
        .map(field => typeof field === 'string' ? field : field.name);

    // Check if all required fields have values
    return requiredFields.every(field => {
        const value = formData[field];
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        return value && value.toString().trim() !== '';
    });
};
