import React, { useContext, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AuthContext from "../auth/AuthContext";
import { loadFormData } from "../utils/formPersistence";
import { getResumeData } from "../api";
import {
    hasAnyProgress,
    getOverallProgress,
    loadSectionProgress,
    STATUS
} from "../utils/formProgress";
import { formSections } from '../data/formStructure';

const DashboardPage = () => {
    const { user } = useContext(AuthContext);
    const [hasProgress, setHasProgress] = useState(false);
    const [progressPercentage, setProgressPercentage] = useState(0);

    console.log('🏠 DashboardPage rendered, user:', user); // Debug log

    useEffect(() => {
        const loadProgressFromDatabase = async () => {
            if (!user || !user.token) {
                console.log('🏠 DashboardPage: Waiting for user and token before loading data', user);
                return;
            }
            console.log('🏠 DashboardPage: Loading progress for user:', user.email, 'with token:', user.token);
            try {
                // Try to load from database first
                const savedData = await getResumeData(user.token);
                let formData = {};
                if (savedData && savedData.formData) {
                    formData = savedData.formData;
                    console.log('🏠 DashboardPage: Loaded data from database:', formData);
                } else {
                    // Fallback to localStorage
                    formData = loadFormData(user.email, {});
                    console.log('🏠 DashboardPage: Loaded data from localStorage:', formData);
                }
                // Load saved section progress to get accurate completion status
                const savedSectionProgress = loadSectionProgress(user.email);
                console.log('🏠 DashboardPage: Loaded saved section progress:', savedSectionProgress);
                let progress, percentage;
                if (Object.keys(savedSectionProgress).length > 0) {
                    // Use saved progress for more accurate status
                    const completedSections = Object.values(savedSectionProgress).filter(status => status === STATUS.COMPLETED).length;
                    const totalSections = formSections.length;
                    percentage = Math.round((completedSections / totalSections) * 100);
                    progress = completedSections > 0 || hasAnyProgress(formData, formSections);
                    console.log('🏠 DashboardPage: Using saved section progress:', { completedSections, totalSections, percentage });
                } else {
                    // Fallback to calculating from formData
                    progress = hasAnyProgress(formData, formSections);
                    percentage = getOverallProgress(formData, formSections);
                    console.log('🏠 DashboardPage: Calculated progress from formData:', { progress, percentage });
                }
                setHasProgress(progress);
                setProgressPercentage(percentage);
            } catch (error) {
                console.error('🏠 DashboardPage: Error loading progress:', error);
                // Handle 404 (no saved form data) gracefully
                if (error.response && error.response.status === 404 && error.response.data && error.response.data.error === "No saved form data found") {
                    setHasProgress(false);
                    setProgressPercentage(0);
                }
            }
        };
        loadProgressFromDatabase();
    }, [user?.token, user?.email]);

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper" id="main-content" role="main">
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">
                        <h1 className="govuk-heading-xl">
                            Your funeral expenses payment applications
                        </h1>

                        <p className="govuk-body-l">
                            Welcome back, {user?.name}
                        </p>

                        <h2 className="govuk-heading-m">What you can do</h2>

                        <div className="govuk-summary-card">
                            <div className="govuk-summary-card__title-wrapper">
                                <h3 className="govuk-summary-card__title">
                                    {hasProgress ? "Continue your application" : "Apply for funeral expenses payment"}
                                </h3>
                            </div>
                            <div className="govuk-summary-card__content">
                                <div className="govuk-summary-card__body">
                                    {hasProgress ? (
                                        <>
                                            <p className="govuk-body">
                                                You have a funeral expenses payment application in progress.
                                            </p>
                                            <p className="govuk-body">
                                                <strong>Progress: {progressPercentage}% complete</strong>
                                            </p>
                                            <Link
                                                to="/tasks"
                                                role="button"
                                                draggable="false"
                                                className="govuk-button"
                                                data-module="govuk-button"
                                            >
                                                Continue application
                                            </Link>
                                        </>
                                    ) : (
                                        <>
                                            <p className="govuk-body">
                                                Start a new application to help pay for a funeral. You can get up to £1,000
                                                to help pay for funeral expenses if you're getting certain benefits or tax credits.
                                            </p>
                                            <Link
                                                to="/form?fresh=true"
                                                role="button"
                                                draggable="false"
                                                className="govuk-button govuk-button--start"
                                                data-module="govuk-button"
                                            >
                                                Start application
                                                <svg className="govuk-button__start-icon" xmlns="http://www.w3.org/2000/svg" width="17.5" height="19" viewBox="0 0 33 40" aria-hidden="true" focusable="false">
                                                    <path fill="currentColor" d="M0 0h13l20 20-20 20H0l20-20z" />
                                                </svg>
                                            </Link>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="govuk-summary-card">
                            <div className="govuk-summary-card__title-wrapper">
                                <h3 className="govuk-summary-card__title">Your previous applications</h3>
                            </div>
                            <div className="govuk-summary-card__content">
                                <div className="govuk-summary-card__body">
                                    <p className="govuk-body">
                                        You have not submitted any applications yet.
                                    </p>
                                    <p className="govuk-body">
                                        When you do, you'll be able to:
                                    </p>
                                    <ul className="govuk-list govuk-list--bullet">
                                        <li>check the status of your applications</li>
                                        <li>view decisions on your applications</li>
                                        <li>upload additional documents if needed</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <h2 className="govuk-heading-m">Help and support</h2>

                        <div className="govuk-inset-text">
                            If you need help with your application, you can:
                            <ul className="govuk-list govuk-list--bullet">
                                <li>contact the Funeral Expenses Payment helpline on 0800 731 0469</li>
                                <li>use the webchat service (available Monday to Friday, 8am to 6pm)</li>
                                <li>contact your local Citizens Advice</li>
                            </ul>
                        </div>

                        <details className="govuk-details" data-module="govuk-details">
                            <summary className="govuk-details__summary">
                                <span className="govuk-details__summary-text">
                                    Who can apply for funeral expenses payment?
                                </span>
                            </summary>
                            <div className="govuk-details__text">
                                <p className="govuk-body">You can apply if you're responsible for paying for a funeral and you get:</p>
                                <ul className="govuk-list govuk-list--bullet">
                                    <li>Income Support</li>
                                    <li>income-based Jobseeker's Allowance</li>
                                    <li>income-related Employment and Support Allowance</li>
                                    <li>Pension Credit</li>
                                    <li>Universal Credit</li>
                                    <li>Child Tax Credit</li>
                                    <li>Working Tax Credit</li>
                                </ul>
                                <p className="govuk-body">
                                    You must also meet other eligibility criteria. The application form will guide you through these.
                                </p>
                            </div>
                        </details>
                        {/* Bottom links for navigation and sign out */}
                        <div className="dashboard-bottom-links">
                            <Link to="/dashboard" className="govuk-link govuk-!-margin-right-4">
                                Return to dashboard
                            </Link>
                            <a
                                href="/"
                                className="govuk-link dashboard-signout-link"
                                style={{ marginLeft: 'auto' }}
                                onClick={e => {
                                    e.preventDefault();
                                    if (window.confirm('Are you sure you want to sign out? Unsaved changes may be lost.')) {
                                        window.localStorage.removeItem('user');
                                        window.location.href = '/';
                                    }
                                }}
                            >
                                Sign out
                            </a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DashboardPage;
