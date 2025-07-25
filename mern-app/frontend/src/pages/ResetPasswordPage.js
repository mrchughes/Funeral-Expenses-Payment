import React, { useState } from "react";
import { resetPassword } from "../api";
import { Link } from "react-router-dom";

const ResetPasswordPage = () => {
    const [resetData, setResetData] = useState({ email: "", newPassword: "" });
    const [resetErrors, setResetErrors] = useState({});
    const [resetSuccess, setResetSuccess] = useState("");

    const handleResetChange = (e) => {
        setResetData({ ...resetData, [e.target.name]: e.target.value });
        if (resetErrors[e.target.name]) {
            setResetErrors({ ...resetErrors, [e.target.name]: "" });
        }
    };

    const validateReset = () => {
        const newErrors = {};
        if (!resetData.email) {
            newErrors.email = "Enter your email address";
        } else if (!/\S+@\S+\.\S+/.test(resetData.email)) {
            newErrors.email = "Enter an email address in the correct format, like name@example.com";
        }
        if (!resetData.newPassword) {
            newErrors.newPassword = "Enter a new password";
        } else if (resetData.newPassword.length < 8) {
            newErrors.newPassword = "Password must be at least 8 characters";
        }
        return newErrors;
    };

    const handleResetSubmit = async (e) => {
        e.preventDefault();
        setResetErrors({});
        setResetSuccess("");
        const validationErrors = validateReset();
        if (Object.keys(validationErrors).length > 0) {
            setResetErrors(validationErrors);
            return;
        }
        try {
            await resetPassword(resetData);
            setResetSuccess("Password reset successfully. You can now sign in with your new password.");
            setResetData({ email: "", newPassword: "" });
        } catch (err) {
            setResetErrors({ general: err.message || "Password reset failed" });
        }
    };

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper" id="main-content" role="main">
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">
                        <h1 className="govuk-heading-xl">Reset your password</h1>
                        {resetErrors.general && (
                            <div className="govuk-error-summary" role="alert">
                                <ul className="govuk-list govuk-error-summary__list">
                                    <li>{resetErrors.general}</li>
                                </ul>
                            </div>
                        )}
                        {resetSuccess ? (
                            <>
                                <div className="govuk-notification-banner govuk-notification-banner--success" role="alert">
                                    <div className="govuk-notification-banner__content">{resetSuccess}</div>
                                </div>
                                <p style={{ marginTop: 24 }}>
                                    <Link to="/login" className="govuk-link">Back to sign in</Link>
                                </p>
                            </>
                        ) : (
                            <>
                                <form onSubmit={handleResetSubmit} noValidate style={{ marginTop: 32 }}>
                                    <div className={`govuk-form-group ${resetErrors.email ? 'govuk-form-group--error' : ''}`}>
                                        <label className="govuk-label govuk-label--m" htmlFor="reset-email">Email address</label>
                                        {resetErrors.email && (
                                            <p className="govuk-error-message"><span className="govuk-visually-hidden">Error:</span> {resetErrors.email}</p>
                                        )}
                                        <input
                                            className={`govuk-input ${resetErrors.email ? 'govuk-input--error' : ''}`}
                                            id="reset-email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            value={resetData.email}
                                            onChange={handleResetChange}
                                        />
                                    </div>
                                    <div className={`govuk-form-group ${resetErrors.newPassword ? 'govuk-form-group--error' : ''}`}>
                                        <label className="govuk-label govuk-label--m" htmlFor="reset-newPassword">New password</label>
                                        {resetErrors.newPassword && (
                                            <p className="govuk-error-message"><span className="govuk-visually-hidden">Error:</span> {resetErrors.newPassword}</p>
                                        )}
                                        <input
                                            className={`govuk-input ${resetErrors.newPassword ? 'govuk-input--error' : ''}`}
                                            id="reset-newPassword"
                                            name="newPassword"
                                            type="password"
                                            autoComplete="new-password"
                                            value={resetData.newPassword}
                                            onChange={handleResetChange}
                                        />
                                    </div>
                                    <button className="govuk-button" type="submit">Reset password</button>
                                </form>
                                <p style={{ marginTop: 24 }}>
                                    <Link to="/login" className="govuk-link">Back to sign in</Link>
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ResetPasswordPage;
