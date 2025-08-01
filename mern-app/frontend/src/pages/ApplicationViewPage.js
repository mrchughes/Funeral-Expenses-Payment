import React, { useState, useEffect, useContext } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AuthContext from "../auth/AuthContext";
import { getApplicationById } from "../api/application";
import { formSections } from "../data/formStructure";

const ApplicationViewPage = () => {
    const { applicationId } = useParams();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [application, setApplication] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchApplication = async () => {
            try {
                if (!user?.token) {
                    navigate('/login');
                    return;
                }

                const fetchedApplication = await getApplicationById(applicationId, user.token);
                setApplication(fetchedApplication);
                setLoading(false);
            } catch (error) {
                console.error("Failed to fetch application:", error);
                setError(error.message || "Failed to load application");
                setLoading(false);
            }
        };

        fetchApplication();
    }, [applicationId, user, navigate]);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Helper function to format field values
    const formatFieldValue = (value) => {
        if (value === null || value === undefined) return "Not provided";
        if (typeof value === "boolean") return value ? "Yes" : "No";
        if (Array.isArray(value)) {
            if (value.length === 0) return "None";
            return value.join(", ");
        }
        return value.toString();
    };

    // Helper function to get section title from ID
    const getSectionTitle = (sectionId) => {
        const section = formSections.find(s => s.id === sectionId);
        return section ? section.title : sectionId;
    };

    // Helper function to get field label from name and section
    const getFieldLabel = (sectionId, fieldName) => {
        const section = formSections.find(s => s.id === sectionId);
        if (!section) return fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

        const field = section.fields.find(f => f.name === fieldName);
        return field ? field.label : fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    };

    if (loading) {
        return (
            <div className="govuk-width-container">
                <main className="govuk-main-wrapper" id="main-content" role="main">
                    <div className="govuk-grid-row">
                        <div className="govuk-grid-column-two-thirds">
                            <h1 className="govuk-heading-xl">Loading application...</h1>
                            <div className="govuk-body">Please wait while we load your application details.</div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className="govuk-width-container">
                <main className="govuk-main-wrapper" id="main-content" role="main">
                    <div className="govuk-grid-row">
                        <div className="govuk-grid-column-two-thirds">
                            <h1 className="govuk-heading-xl">Error</h1>
                            <div className="govuk-error-summary" aria-labelledby="error-summary-title" role="alert" tabIndex="-1">
                                <h2 className="govuk-error-summary__title" id="error-summary-title">
                                    There was a problem
                                </h2>
                                <div className="govuk-error-summary__body">
                                    <p>{error}</p>
                                </div>
                            </div>
                            <Link to="/dashboard" className="govuk-button">Return to dashboard</Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    if (!application) {
        return (
            <div className="govuk-width-container">
                <main className="govuk-main-wrapper" id="main-content" role="main">
                    <div className="govuk-grid-row">
                        <div className="govuk-grid-column-two-thirds">
                            <h1 className="govuk-heading-xl">Application not found</h1>
                            <div className="govuk-body">The application you are looking for could not be found.</div>
                            <Link to="/dashboard" className="govuk-button">Return to dashboard</Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper" id="main-content" role="main">
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">
                        <Link to="/dashboard" className="govuk-back-link">Back to dashboard</Link>

                        <h1 className="govuk-heading-xl">Application Details</h1>

                        <div className="govuk-panel govuk-panel--confirmation">
                            <h1 className="govuk-panel__title">
                                Application submitted
                            </h1>
                            <div className="govuk-panel__body">
                                Reference number<br /><strong>{application.applicationId}</strong>
                            </div>
                        </div>

                        <div className="govuk-summary-card">
                            <div className="govuk-summary-card__title-wrapper">
                                <h2 className="govuk-summary-card__title">Application summary</h2>
                            </div>
                            <div className="govuk-summary-card__content">
                                <dl className="govuk-summary-list">
                                    <div className="govuk-summary-list__row">
                                        <dt className="govuk-summary-list__key">Status</dt>
                                        <dd className="govuk-summary-list__value">
                                            <strong className="govuk-tag">
                                                {application.status === 'submitted' ? 'Submitted' : 'In progress'}
                                            </strong>
                                        </dd>
                                    </div>
                                    <div className="govuk-summary-list__row">
                                        <dt className="govuk-summary-list__key">Submitted on</dt>
                                        <dd className="govuk-summary-list__value">
                                            {application.submissionTimestamp ? formatDate(application.submissionTimestamp) : 'Not yet submitted'}
                                        </dd>
                                    </div>
                                    <div className="govuk-summary-list__row">
                                        <dt className="govuk-summary-list__key">Last updated</dt>
                                        <dd className="govuk-summary-list__value">
                                            {formatDate(application.updatedAt)}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </div>

                        {/* Render each section of the form data */}
                        {formSections.map(section => {
                            const sectionData = application.formData[section.id];
                            if (!sectionData || Object.keys(sectionData).length === 0) {
                                return null; // Skip empty sections
                            }

                            return (
                                <div key={section.id} className="govuk-summary-card">
                                    <div className="govuk-summary-card__title-wrapper">
                                        <h2 className="govuk-summary-card__title">{section.title}</h2>
                                    </div>
                                    <div className="govuk-summary-card__content">
                                        <dl className="govuk-summary-list">
                                            {Object.entries(sectionData).map(([fieldName, fieldValue]) => (
                                                <div key={fieldName} className="govuk-summary-list__row">
                                                    <dt className="govuk-summary-list__key">
                                                        {getFieldLabel(section.id, fieldName)}
                                                    </dt>
                                                    <dd className="govuk-summary-list__value">
                                                        {formatFieldValue(fieldValue)}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Evidence section if there's any */}
                        {application.evidence && application.evidence.length > 0 && (
                            <div className="govuk-summary-card">
                                <div className="govuk-summary-card__title-wrapper">
                                    <h2 className="govuk-summary-card__title">Evidence documents</h2>
                                </div>
                                <div className="govuk-summary-card__content">
                                    <table className="govuk-table">
                                        <thead className="govuk-table__head">
                                            <tr className="govuk-table__row">
                                                <th scope="col" className="govuk-table__header">Document</th>
                                                <th scope="col" className="govuk-table__header">Type</th>
                                                <th scope="col" className="govuk-table__header">Uploaded</th>
                                            </tr>
                                        </thead>
                                        <tbody className="govuk-table__body">
                                            {application.evidence.map(evidence => (
                                                <tr key={evidence.evidenceId} className="govuk-table__row">
                                                    <td className="govuk-table__cell">{evidence.filename}</td>
                                                    <td className="govuk-table__cell">{evidence.documentType || 'Unknown'}</td>
                                                    <td className="govuk-table__cell">{formatDate(evidence.uploadTimestamp)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <Link to="/dashboard" className="govuk-button">Return to dashboard</Link>

                        <div className="govuk-inset-text">
                            <p>If you need to make changes to your application or have any questions, please contact the Funeral Expenses Payment helpline on 0800 731 0469.</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ApplicationViewPage;
