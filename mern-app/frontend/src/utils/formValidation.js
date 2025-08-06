// Form validation utility functions
import { validatePostcode, validateNINO, validatePhoneNumber, validateEmail } from "./validation";

// Validate a specific section of the form
export const validateSection = (formData, section) => {
    const errors = {};

    // Skip validation if section isn't provided
    if (!section || !section.fields) {
        return errors;
    }

    // Validate each field based on its type and requirements
    section.fields.forEach(field => {
        // Skip validation for non-required fields that are empty
        const fieldName = typeof field === 'string' ? field : field.name;
        const fieldType = typeof field === 'string' ? 'text' : field.type;
        const isRequired = typeof field === 'string' || field.required !== false;

        const value = formData[fieldName];

        // Skip validation for optional empty fields
        if (!isRequired && (!value || (Array.isArray(value) && value.length === 0))) {
            return;
        }

        // Required field validation
        if (isRequired && (!value || value.toString().trim() === '' || (Array.isArray(value) && value.length === 0))) {
            errors[fieldName] = `${typeof field === 'string' ? fieldName : field.label} is required`;
            return;
        }

        // Type-specific validation
        switch (fieldType) {
            case 'email':
                if (!validateEmail(value)) {
                    errors[fieldName] = 'Enter a valid email address';
                }
                break;

            case 'tel':
                if (!validatePhoneNumber(value)) {
                    errors[fieldName] = 'Enter a valid phone number';
                }
                break;

            case 'postcode':
                if (!validatePostcode(value)) {
                    errors[fieldName] = 'Enter a valid UK postcode';
                }
                break;

            case 'nino':
                if (!validateNINO(value)) {
                    errors[fieldName] = 'Enter a valid National Insurance number';
                }
                break;

            case 'date':
                // Basic date validation - could be enhanced
                if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value) && !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
                    errors[fieldName] = 'Enter a valid date';
                }
                break;

            default:
                // No additional validation for other types
                break;
        }
    });

    return errors;
};
