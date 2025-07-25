import React, { useState, useContext } from "react";
import { Link } from "react-router-dom";
import AuthContext from "../auth/AuthContext";
import { login } from "../api";

const LoginPage = () => {
    const [formData, setFormData] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const { login: loginUser } = useContext(AuthContext);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        // Clear specific field error when user types
        if (errors[e.target.name]) {
            setErrors({ ...errors, [e.target.name]: "" });
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.email) {
            newErrors.email = "Enter your email address";
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = "Enter an email address in the correct format, like name@example.com";
        }
        if (!formData.password) {
            newErrors.password = "Enter your password";
        }
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({});
        setLoading(true);
        // Explicitly clear any previous user state on new login attempt
        if (typeof loginUser === "function") {
            loginUser(null); // Reset user state before new login
        }

        // Validation
        const validationErrors = validateForm();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            setLoading(false);
            return;
        }

        try {
            const data = await login(formData);
            if (data && data.token) {
                loginUser(data);
            } else {
                setErrors({ general: "Login failed: No token received." });
            }
        } catch (err) {
            setErrors({
                general: err.message || "Enter a correct email address and password"
            });
            // Also clear user state on error
            if (typeof loginUser === "function") {
                loginUser(null);
            }
        } finally {
            setLoading(false);
        }
    };

    const hasErrors = Object.keys(errors).length > 0;

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper" id="main-content" role="main">
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">
                        <h1 className="govuk-heading-xl">Sign in</h1>
                        <p className="govuk-body-l">
                            Sign in to your secure account to apply for funeral expenses payment or check your existing applications.
                        </p>
                        {hasErrors && (
                            <div className="govuk-error-summary" aria-labelledby="error-summary-title" role="alert" data-module="govuk-error-summary">
                                <h2 className="govuk-error-summary__title" id="error-summary-title">
                                    There is a problem
                                </h2>
                                <div className="govuk-error-summary__body">
                                    <ul className="govuk-list govuk-error-summary__list">
                                        {errors.general && (
                                            <li>
                                                <a href="#email">{errors.general}</a>
                                            </li>
                                        )}
                                        {errors.email && (
                                            <li>
                                                <a href="#email">{errors.email}</a>
                                            </li>
                                        )}
                                        {errors.password && (
                                            <li>
                                                <a href="#password">{errors.password}</a>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}
                        <form onSubmit={handleSubmit} noValidate>
                            <div className={`govuk-form-group ${errors.email ? 'govuk-form-group--error' : ''}`}>
                                <label className="govuk-label govuk-label--m" htmlFor="email">
                                    Email address
                                </label>
                                <div id="email-hint" className="govuk-hint">
                                    We'll only use this to send you updates about your application
                                </div>
                                {errors.email && (
                                    <p id="email-error" className="govuk-error-message">
                                        <span className="govuk-visually-hidden">Error:</span> {errors.email}
                                    </p>
                                )}
                                <input
                                    className={`govuk-input ${errors.email ? 'govuk-input--error' : ''}`}
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    spellCheck="false"
                                    value={formData.email}
                                    onChange={handleChange}
                                    disabled={loading}
                                    aria-describedby={`email-hint ${errors.email ? 'email-error' : ''}`}
                                />
                            </div>
                            <div className={`govuk-form-group ${errors.password ? 'govuk-form-group--error' : ''}`}>
                                <label className="govuk-label govuk-label--m" htmlFor="password">
                                    Password
                                </label>
                                {errors.password && (
                                    <p id="password-error" className="govuk-error-message">
                                        <span className="govuk-visually-hidden">Error:</span> {errors.password}
                                    </p>
                                )}
                                <input
                                    className={`govuk-input ${errors.password ? 'govuk-input--error' : ''}`}
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    disabled={loading}
                                    aria-describedby={errors.password ? 'password-error' : ''}
                                />
                            </div>
                            <button
                                className="govuk-button"
                                data-module="govuk-button"
                                disabled={loading}
                                type="submit"
                            >
                                {loading ? "Signing in..." : "Sign in"}
                            </button>
                        </form>
                        <p style={{ marginTop: 24 }}>
                            <Link to="/reset-password" className="govuk-link">Forgot your password?</Link>
                        </p>
                        <h2 className="govuk-heading-m">Don't have an account?</h2>
                        <p className="govuk-body">
                            You need to{" "}
                            <Link to="/register" className="govuk-link">
                                create an account
                            </Link>{" "}
                            before you can apply.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default LoginPage;
