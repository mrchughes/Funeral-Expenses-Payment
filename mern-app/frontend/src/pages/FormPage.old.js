// Fully implemented multi-step funeral payment form
import React, { useState, useEffect, useContext } from "react";
import { getResumeData, submitForm } from "../api";
import AuthContext from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { formSections, getConditionalFields } from "../data/formStructure";

const FormPage = () => {
    const [formData, setFormData] = useState({});
    const [currentStep, setCurrentStep] = useState(0);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getResumeData(user.token);
                if (data) {
                    setFormData(data);
                    // Resume from the last incomplete section
                    const lastCompletedStep = findLastCompletedStep(data);
                    setCurrentStep(lastCompletedStep + 1 < formSections.length ? lastCompletedStep + 1 : lastCompletedStep);
                }
            } catch (error) {
                console.log("No saved data found, starting fresh");
            }
        };
        fetchData();
    }, [user]);

    const findLastCompletedStep = (data) => {
        for (let i = formSections.length - 1; i >= 0; i--) {
            const section = formSections[i];
            const isComplete = section.fields.every(field => {
                if (field.required) {
                    return data[field.name] && data[field.name] !== '';
                }
                return true;
            });
            if (isComplete) return i;
        }
        return 0;
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        let newValue = value;

        if (type === 'checkbox') {
            if (e.target.hasAttribute('data-group')) {
                // Handle checkbox groups
                const currentValues = formData[name] || [];
                newValue = checked 
                    ? [...currentValues, value]
                    : currentValues.filter(v => v !== value);
            } else {
                // Handle single checkbox
                newValue = checked;
            }
        }

        setFormData(prev => ({ ...prev, [name]: newValue }));
        
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }

        // Auto-save after 2 seconds of inactivity
        clearTimeout(window.autoSaveTimer);
        window.autoSaveTimer = setTimeout(() => {
            autoSave();
        }, 2000);
    };

    const autoSave = async () => {
        if (Object.keys(formData).length > 0) {
            setSaving(true);
            try {
                // Save to backend without submitting
                await submitForm({ ...formData, isAutoSave: true }, user.token);
            } catch (error) {
                console.error("Auto-save failed:", error);
            } finally {
                setSaving(false);
            }
        }
    };

    const validateCurrentStep = () => {
        const currentSection = formSections[currentStep];
        const stepErrors = {};
        const conditionalFields = getConditionalFields(formData);

        currentSection.fields.forEach(field => {
            if (field.required && conditionalFields[field.name]) {
                const value = formData[field.name];
                if (!value || (Array.isArray(value) && value.length === 0)) {
                    stepErrors[field.name] = `${field.label} is required`;
                }
            }

            // Email validation
            if (field.type === 'email' && formData[field.name]) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(formData[field.name])) {
                    stepErrors[field.name] = 'Please enter a valid email address';
                }
            }

            // Date validation
            if (field.type === 'date' && formData[field.name]) {
                const date = new Date(formData[field.name]);
                if (isNaN(date.getTime())) {
                    stepErrors[field.name] = 'Please enter a valid date';
                }
            }

            // Number validation
            if (field.type === 'number' && formData[field.name]) {
                if (isNaN(formData[field.name]) || formData[field.name] < 0) {
                    stepErrors[field.name] = 'Please enter a valid positive number';
                }
            }
        });

        setErrors(stepErrors);
        return Object.keys(stepErrors).length === 0;
    };

    const handleNext = () => {
        if (validateCurrentStep()) {
            if (currentStep < formSections.length - 1) {
                setCurrentStep(currentStep + 1);
            }
        }
    };

    const handlePrevious = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateCurrentStep()) return;

        if (isLastStep) {
            // Navigate to review page for final review
            navigate("/review");
        } else {
            handleNext();
        }
    };

    const renderField = (field) => {
        const conditionalFields = getConditionalFields(formData);
        if (!conditionalFields[field.name]) return null;

        const value = formData[field.name] || '';
        const error = errors[field.name];

        switch (field.type) {
            case 'select':
                return (
                    <div key={field.name} className={`govuk-form-group ${error ? 'govuk-form-group--error' : ''}`}>
                        <label className="govuk-label govuk-label--s">{field.label}</label>
                        {error && <span className="govuk-error-message">{error}</span>}
                        <select
                            name={field.name}
                            value={value}
                            onChange={handleChange}
                            className={`govuk-select ${error ? 'govuk-select--error' : ''}`}
                            required={field.required}
                        >
                            <option value="">Select an option</option>
                            {field.options.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>
                );

            case 'radio':
                return (
                    <div key={field.name} className={`govuk-form-group ${error ? 'govuk-form-group--error' : ''}`}>
                        <fieldset className="govuk-fieldset">
                            <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">
                                {field.label}
                            </legend>
                            {error && <span className="govuk-error-message">{error}</span>}
                            <div className="govuk-radios">
                                {field.options.map(option => (
                                    <div key={option} className="govuk-radios__item">
                                        <input
                                            className="govuk-radios__input"
                                            type="radio"
                                            name={field.name}
                                            value={option}
                                            checked={value === option}
                                            onChange={handleChange}
                                            id={`${field.name}-${option}`}
                                        />
                                        <label className="govuk-label govuk-radios__label" htmlFor={`${field.name}-${option}`}>
                                            {option}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </fieldset>
                    </div>
                );

            case 'checkbox':
                if (field.options) {
                    // Checkbox group
                    return (
                        <div key={field.name} className={`govuk-form-group ${error ? 'govuk-form-group--error' : ''}`}>
                            <fieldset className="govuk-fieldset">
                                <legend className="govuk-fieldset__legend govuk-fieldset__legend--s">
                                    {field.label}
                                </legend>
                                {error && <span className="govuk-error-message">{error}</span>}
                                <div className="govuk-checkboxes">
                                    {field.options.map(option => (
                                        <div key={option} className="govuk-checkboxes__item">
                                            <input
                                                className="govuk-checkboxes__input"
                                                type="checkbox"
                                                name={field.name}
                                                value={option}
                                                checked={(value || []).includes(option)}
                                                onChange={handleChange}
                                                id={`${field.name}-${option}`}
                                                data-group="true"
                                            />
                                            <label className="govuk-label govuk-checkboxes__label" htmlFor={`${field.name}-${option}`}>
                                                {option}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </fieldset>
                        </div>
                    );
                } else {
                    // Single checkbox
                    return (
                        <div key={field.name} className={`govuk-form-group ${error ? 'govuk-form-group--error' : ''}`}>
                            <div className="govuk-checkboxes">
                                <div className="govuk-checkboxes__item">
                                    <input
                                        className="govuk-checkboxes__input"
                                        type="checkbox"
                                        name={field.name}
                                        checked={!!value}
                                        onChange={handleChange}
                                        id={field.name}
                                        required={field.required}
                                    />
                                    <label className="govuk-label govuk-checkboxes__label" htmlFor={field.name}>
                                        {field.label}
                                    </label>
                                </div>
                            </div>
                            {error && <span className="govuk-error-message">{error}</span>}
                        </div>
                    );
                }

            case 'textarea':
                return (
                    <div key={field.name} className={`govuk-form-group ${error ? 'govuk-form-group--error' : ''}`}>
                        <label className="govuk-label govuk-label--s" htmlFor={field.name}>
                            {field.label}
                        </label>
                        {error && <span className="govuk-error-message">{error}</span>}
                        <textarea
                            className={`govuk-textarea ${error ? 'govuk-textarea--error' : ''}`}
                            id={field.name}
                            name={field.name}
                            rows="4"
                            value={value}
                            onChange={handleChange}
                            required={field.required}
                        />
                    </div>
                );

            default:
                return (
                    <div key={field.name} className={`govuk-form-group ${error ? 'govuk-form-group--error' : ''}`}>
                        <label className="govuk-label govuk-label--s" htmlFor={field.name}>
                            {field.label}
                        </label>
                        {error && <span className="govuk-error-message">{error}</span>}
                        <input
                            className={`govuk-input ${error ? 'govuk-input--error' : ''}`}
                            id={field.name}
                            name={field.name}
                            type={field.type}
                            value={value}
                            onChange={handleChange}
                            required={field.required}
                        />
                    </div>
                );
        }
    };

    const currentSection = formSections[currentStep];
    const isLastStep = currentStep === formSections.length - 1;

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper">
                {/* Progress indicator */}
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-full">
                        <div className="progress-indicator">
                            <p className="govuk-body-s">
                                Step {currentStep + 1} of {formSections.length}
                                {saving && <span className="saving-indicator"> (Saving...)</span>}
                            </p>
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill" 
                                    style={{ width: `${((currentStep + 1) / formSections.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form content */}
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">
                        <h1 className="govuk-heading-l">{currentSection.title}</h1>
                        
                        {errors.submit && (
                            <div className="govuk-error-summary" role="alert">
                                <h2 className="govuk-error-summary__title">There is a problem</h2>
                                <div className="govuk-error-summary__body">
                                    <p>{errors.submit}</p>
                                </div>
                            </div>
                        )}

                        <form onSubmit={isLastStep ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
                            {currentSection.fields.map(renderField)}

                            <div className="govuk-button-group">
                                {currentStep > 0 && (
                                    <button
                                        type="button"
                                        className="govuk-button govuk-button--secondary"
                                        onClick={handlePrevious}
                                    >
                                        Previous
                                    </button>
                                )}
                                
                                <button
                                    type="submit"
                                    className="govuk-button"
                                    disabled={loading}
                                >
                                    {loading ? "Saving..." : isLastStep ? "Review application" : "Continue"}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Side navigation */}
                    <div className="govuk-grid-column-one-third">
                        <nav className="section-nav">
                            <h2 className="govuk-heading-s">Sections</h2>
                            <ul className="govuk-list">
                                {formSections.map((section, index) => (
                                    <li key={section.id}>
                                        <button
                                            type="button"
                                            className={`section-nav-link ${index === currentStep ? 'current' : ''} ${index < currentStep ? 'completed' : ''}`}
                                            onClick={() => setCurrentStep(index)}
                                            disabled={index > currentStep}
                                        >
                                            {section.title}
                                            {index < currentStep && <span className="completed-indicator">✓</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default FormPage;
