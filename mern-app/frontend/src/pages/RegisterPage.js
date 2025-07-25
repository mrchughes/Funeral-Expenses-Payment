import React, { useState, useContext } from "react";
import { Link } from "react-router-dom";
import AuthContext from "../auth/AuthContext";
import { register } from "../api";

const RegisterPage = () => {
    const [formData, setFormData] = useState({ name: "", email: "", password: "" });
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
        
        if (!formData.name) {
            newErrors.name = "Enter your full name";
        } else if (formData.name.length < 2) {
            newErrors.name = "Full name must be 2 characters or more";
        }
        
        if (!formData.email) {
            newErrors.email = "Enter your email address";
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = "Enter an email address in the correct format, like name@example.com";
        }
        
        if (!formData.password) {
            newErrors.password = "Enter a password";
        } else if (formData.password.length < 8) {
            newErrors.password = "Password must be 8 characters or more";
        }
        
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({});
        setLoading(true);

        // Validation
        const validationErrors = validateForm();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            setLoading(false);
            return;
        }

        try {
            const data = await register(formData);
            loginUser(data); // Pass the full data object, not just the token
        } catch (err) {
            setErrors({ 
                general: err.message || "There was a problem creating your account. Please try again." 
            });
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
                        <h1 className="govuk-heading-xl">Create an account</h1>
                        
                        <p className="govuk-body-l">
                            Create an account to apply for funeral expenses payment.
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
                                                <a href="#name">{errors.general}</a>
                                            </li>
                                        )}
                                        {errors.name && (
                                            <li>
                                                <a href="#name">{errors.name}</a>
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
                            <div className={`govuk-form-group ${errors.name ? 'govuk-form-group--error' : ''}`}>
                                <label className="govuk-label govuk-label--m" htmlFor="name">
                                    Full name
                                </label>
                                {errors.name && (
                                    <p id="name-error" className="govuk-error-message">
                                        <span className="govuk-visually-hidden">Error:</span> {errors.name}
                                    </p>
                                )}
                                <input 
                                    className={`govuk-input ${errors.name ? 'govuk-input--error' : ''}`}
                                    id="name"
                                    name="name" 
                                    type="text"
                                    autoComplete="name"
                                    spellCheck="false"
                                    value={formData.name} 
                                    onChange={handleChange} 
                                    disabled={loading}
                                    aria-describedby={errors.name ? 'name-error' : ''}
                                />
                            </div>

                            <div className={`govuk-form-group ${errors.email ? 'govuk-form-group--error' : ''}`}>
                                <label className="govuk-label govuk-label--m" htmlFor="email">
                                    Email address
                                </label>
                                <div id="email-hint" className="govuk-hint">
                                    We'll use this to send you updates about your application
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
                                    Create a password
                                </label>
                                <div id="password-hint" className="govuk-hint">
                                    Must be at least 8 characters
                                </div>
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
                                    autoComplete="new-password"
                                    value={formData.password} 
                                    onChange={handleChange} 
                                    disabled={loading}
                                    aria-describedby={`password-hint ${errors.password ? 'password-error' : ''}`}
                                />
                            </div>
                            
                            <button 
                                className="govuk-button" 
                                data-module="govuk-button" 
                                disabled={loading}
                                type="submit"
                            >
                                {loading ? "Creating account..." : "Create account"}
                            </button>
                        </form>

                        <h2 className="govuk-heading-m">Already have an account?</h2>
                        <p className="govuk-body">
                            <Link to="/" className="govuk-link">
                                Sign in to your account
                            </Link>
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default RegisterPage;
