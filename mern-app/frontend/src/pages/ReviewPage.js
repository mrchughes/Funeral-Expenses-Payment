// Review page for checking and amending form data before submission
import React, { useState, useEffect, useContext } from "react";
import { getResumeData, submitForm } from "../api";
import AuthContext from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { formSections, getConditionalFields } from "../data/formStructure";
import ChatbotWidget from "../components/ChatbotWidget";

const ReviewPage = () => {
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [aiFeedback, setAiFeedback] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            if (!user?.token) return;

            try {
                const data = await getResumeData(user.token);
                console.log('🔍 ReviewPage: Loaded form data:', data); // Debug log

                // Handle the response structure - data might be nested in formData
                if (data && data.formData) {
                    console.log('📋 ReviewPage: Setting formData from nested structure:', data.formData); // Debug log
                    setFormData(data.formData);
                } else if (data) {
                    console.log('📋 ReviewPage: Setting formData directly:', data); // Debug log
                    setFormData(data);
                } else {
                    // No saved data, redirect to form
                    console.log('❌ ReviewPage: No saved data found, redirecting to form');
                    navigate("/form");
                }
            } catch (error) {
                console.error("❌ ReviewPage: Error fetching form data:", error);
                navigate("/form");
            }
        };
        fetchData();
    }, [user, navigate]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const response = await submitForm({ ...formData, isAutoSave: false }, user.token);
            // Keep user data after submission - user may want to check it again
            // Don't clear saved form data and section progress after successful submission
            console.log('✅ ReviewPage: Form submitted successfully, keeping user data for future reference');
            navigate("/confirmation", { state: { downloadUrl: response.downloadUrl } });
        } catch (error) {
            setErrors({ submit: error.message || "Submission failed" });
        } finally {
            setLoading(false);
        }
    };

    const renderFieldValue = (field, value) => {
        // Handle empty or undefined values
        if (value === undefined || value === null || value === '') {
            return <span className="govuk-hint">Not provided</span>;
        }

        switch (field.type) {
            case 'checkbox':
                if (field.options) {
                    // Handle array values for multiple checkboxes
                    if (Array.isArray(value)) {
                        if (value.length === 0) {
                            return <span className="govuk-hint">None selected</span>;
                        }
                        return (
                            <ul className="govuk-list govuk-list--bullet">
                                {value.map((item, index) => (
                                    <li key={index} className="govuk-body">{item}</li>
                                ))}
                            </ul>
                        );
                    }
                    // Single checkbox with options
                    return value ? <span className="govuk-body">{value}</span> : <span className="govuk-hint">None selected</span>;
                }
                // Handle boolean checkboxes (like declarations)
                return <span className="govuk-body">{value ? 'Yes' : 'No'}</span>;

            case 'radio':
            case 'select':
                return value ? <span className="govuk-body">{value}</span> : <span className="govuk-hint">Not selected</span>;

            case 'date':
                if (value) {
                    try {
                        const date = new Date(value);
                        const formattedDate = date.toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        });
                        return <span className="govuk-body">{formattedDate}</span>;
                    } catch (e) {
                        return <span className="govuk-body">{value}</span>;
                    }
                }
                return <span className="govuk-hint">Not provided</span>;

            case 'number':
                if (field.name === 'funeralCost') {
                    return value ? (
                        <span className="govuk-body govuk-!-font-weight-bold">
                            £{parseFloat(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    ) : <span className="govuk-hint">Not provided</span>;
                }
                return value ? <span className="govuk-body">{value}</span> : <span className="govuk-hint">Not provided</span>;

            case 'email':
                return value ? (
                    <a href={`mailto:${value}`} className="govuk-link govuk-body">
                        {value}
                    </a>
                ) : <span className="govuk-hint">Not provided</span>;

            case 'tel':
                return value ? (
                    <a href={`tel:${value}`} className="govuk-link govuk-body">
                        {value}
                    </a>
                ) : <span className="govuk-hint">Not provided</span>;

            case 'textarea':
                return value ? (
                    <div className="govuk-body" style={{ whiteSpace: 'pre-wrap' }}>{value}</div>
                ) : <span className="govuk-hint">Not provided</span>;

            default:
                return value ? <span className="govuk-body">{value}</span> : <span className="govuk-hint">Not provided</span>;
        }
    };

    const conditionalFields = getConditionalFields(formData);

    // Debug logging
    console.log('🔍 ReviewPage: formData:', formData);
    console.log('🔍 ReviewPage: conditionalFields:', conditionalFields);
    console.log('🔍 ReviewPage: formSections:', formSections);

    // Add handler for AI check
    const handleCheckWithAI = async () => {
        setAiLoading(true);
        setAiFeedback("");
        const questionsAndAnswers = Object.entries(formData)
            .map(([q, a]) => `${q}: ${Array.isArray(a) ? a.join(', ') : a}`)
            .join("\n");
        const API_URL = process.env.REACT_APP_API_URL || "/api";
        const res = await fetch(`${API_URL}/ai-agent/check-form`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: questionsAndAnswers })
        });
        const data = await res.json();
        setAiFeedback(data.response || "No feedback from AI.");
        setAiLoading(false);
    };

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper" id="main-content" role="main">
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">
                        <div className="review-page-intro">
                            <h1 className="govuk-heading-xl">Check your answers before sending your application</h1>
                            <p className="govuk-body-l">
                                Check the information you have provided and make any necessary changes before submitting your application for funeral expenses payment.
                            </p>
                        </div>

                        {errors.submit && (
                            <div className="govuk-error-summary" aria-labelledby="error-summary-title" role="alert" data-module="govuk-error-summary">
                                <h2 className="govuk-error-summary__title" id="error-summary-title">There is a problem</h2>
                                <div className="govuk-error-summary__body">
                                    <ul className="govuk-list govuk-error-summary__list">
                                        <li>
                                            <a href="#submit">{errors.submit}</a>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {formSections.map((section, sectionIndex) => {
                            // Show all sections - don't filter by conditional fields for the review page
                            // Users should see all sections they've encountered in the form
                            console.log(`🔍 Rendering section "${section.title}" with ${section.fields.length} fields`);

                            return (
                                <div key={section.id} className="govuk-summary-card">
                                    <div className="govuk-summary-card__title-wrapper">
                                        <h2 className="govuk-summary-card__title">{section.title}</h2>
                                        <ul className="govuk-summary-card__actions">
                                            <li className="govuk-summary-card__action">
                                                <a
                                                    href="#"
                                                    className="govuk-link"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        // Map section to correct form step
                                                        const stepNumber = sectionIndex + 1; // Sections are 0-indexed, steps are 1-indexed
                                                        console.log(`🔗 Navigating to step ${stepNumber} for section "${section.title}" from review page`);
                                                        navigate(`/form?step=${stepNumber}&returnTo=review`);
                                                    }}
                                                    aria-describedby={`${section.id}-summary`}
                                                >
                                                    Change<span className="govuk-visually-hidden"> {section.title.toLowerCase()}</span>
                                                </a>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="govuk-summary-card__content">
                                        <dl className="govuk-summary-list govuk-summary-list--no-actions" id={`${section.id}-summary`}>
                                            {section.fields
                                                .filter(field => conditionalFields[field.name] !== false)
                                                .map(field => (
                                                    <div key={field.name} className="govuk-summary-list__row">
                                                        <dt className="govuk-summary-list__key">
                                                            {field.label}
                                                        </dt>
                                                        <dd className="govuk-summary-list__value">
                                                            {renderFieldValue(field, formData[field.name])}
                                                        </dd>
                                                    </div>
                                                ))}
                                        </dl>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="submit-section">
                            <h2 className="govuk-heading-m">Now send your application</h2>
                            <p className="govuk-body">
                                By submitting this application you are confirming that, to the best of your knowledge, the details you are providing are correct.
                            </p>

                            <div className="govuk-warning-text">
                                <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
                                <strong className="govuk-warning-text__text">
                                    <span className="govuk-warning-text__assistive">Warning</span>
                                    You may be prosecuted if you deliberately give wrong or incomplete information.
                                </strong>
                            </div>

                            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
                                <div className="govuk-button-group">
                                    <button
                                        type="submit"
                                        className="govuk-button"
                                        data-module="govuk-button"
                                        disabled={loading}
                                        id="submit"
                                    >
                                        {loading ? "Submitting application..." : "Accept and send application"}
                                    </button>
                                    <button
                                        type="button"
                                        className="govuk-button govuk-button--secondary"
                                        onClick={() => navigate("/form")}
                                    >
                                        Go back to check your answers
                                    </button>
                                </div>
                            </form>
                        </div>

                        <button
                            className="govuk-button govuk-button--secondary"
                            style={{ marginTop: 16 }}
                            onClick={handleCheckWithAI}
                        >
                            Check with AI
                        </button>

                        {aiLoading && (
                            <div className="govuk-inset-text" style={{ marginTop: 16 }}>
                                <span className="govuk-body">Checking with AI…</span>
                            </div>
                        )}
                        {aiFeedback && !aiLoading && (
                            <div className="govuk-inset-text" style={{ marginTop: 16, background: '#e7f3f7', borderLeft: '6px solid #1d70b8' }}>
                                <strong className="govuk-heading-s">AI Feedback</strong>
                                <div className="govuk-body" style={{ whiteSpace: 'pre-line' }}>{aiFeedback}</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
            {/* Bottom links for navigation and sign out */}
            <div style={{ marginTop: 40 }}>
                <p className="govuk-body">
                    <Link to="/dashboard" className="govuk-link">
                        Return to dashboard
                    </Link>
                </p>
                <p className="govuk-body">
                    <button
                        type="button"
                        className="govuk-link"
                        style={{ background: 'none', border: 'none', padding: 0, margin: 0, color: '#1d70b8', cursor: 'pointer' }}
                        onClick={() => {
                            if (window.confirm('Are you sure you want to sign out? Unsaved changes may be lost.')) {
                                window.localStorage.removeItem('user');
                                window.location.href = '/';
                            }
                        }}
                    >
                        Sign out
                    </button>
                </p>
            </div>
            <ChatbotWidget />
        </div>
    );
};

export default ReviewPage;
