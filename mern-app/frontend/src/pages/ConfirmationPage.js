import React from "react";
import { useLocation, Link } from "react-router-dom";
import CompletedFormLink from "../components/CompletedFormLink";

const ConfirmationPage = () => {
    const location = useLocation();
    const { downloadUrl } = location.state || {};

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper" id="main-content" role="main">
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">

                        {downloadUrl ? (
                            <CompletedFormLink url={downloadUrl} />
                        ) : (
                            <div className="govuk-panel govuk-panel--confirmation">
                                <h1 className="govuk-panel__title">
                                    Application complete
                                </h1>
                                <div className="govuk-panel__body">
                                    Your reference number<br />
                                    <strong>HDJ2123F</strong>
                                </div>
                            </div>
                        )}

                        <h2 className="govuk-heading-m">What happens next</h2>

                        <p className="govuk-body">
                            We've sent you a confirmation email.
                        </p>

                        <p className="govuk-body">
                            Your application will be processed within 5 working days.
                            You'll receive an email with further instructions.
                        </p>

                        <h2 className="govuk-heading-m">Help with your application</h2>

                        <p className="govuk-body">
                            If you need help with your application, you can{' '}
                            <a href="#" className="govuk-link">contact us</a>.
                        </p>

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
                </div>
            </main>
        </div>
    );
};

export default ConfirmationPage;
