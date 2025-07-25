import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import FormPage from "./pages/FormPage";
import TaskListPage from "./pages/TaskListPage";
import ReviewPage from "./pages/ReviewPage";
import ConfirmationPage from "./pages/ConfirmationPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import Navbar from "./components/Navbar";
import PrivateRoute from "./auth/PrivateRoute";
import "./styles/govuk-overrides.css";

// Simple error boundary
function ErrorBoundary({ children }) {
    const [error, setError] = useState(null);
    if (error) {
        return (
            <div style={{ padding: 40, color: 'red', background: '#fff3f3' }}>
                <h1>Something went wrong</h1>
                <pre>{error.toString()}</pre>
            </div>
        );
    }
    return (
        <React.Fragment>
            {React.Children.map(children, child => {
                try {
                    return child;
                } catch (e) {
                    setError(e);
                    return null;
                }
            })}
        </React.Fragment>
    );
}

const App = () => {
    console.log('🌍 App.js rendering');
    return (
        <ErrorBoundary>
            <div className="govuk-template">
                <a href="#main-content" className="govuk-skip-link">Skip to main content</a>

                <Navbar />

                <div className="govuk-width-container">
                    <main className="govuk-main-wrapper" id="main-content" role="main">
                        <Routes>
                            <Route path="/" element={<LoginPage />} />
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/reset-password" element={<ResetPasswordPage />} />
                            <Route path="/register" element={<RegisterPage />} />
                            <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
                            <Route path="/form" element={<PrivateRoute><FormPage /></PrivateRoute>} />
                            <Route path="/tasks" element={<PrivateRoute><TaskListPage /></PrivateRoute>} />
                            <Route path="/review" element={<PrivateRoute><ReviewPage /></PrivateRoute>} />
                            <Route path="/confirmation" element={<PrivateRoute><ConfirmationPage /></PrivateRoute>} />
                        </Routes>
                    </main>
                </div>

                <footer className="govuk-footer" role="contentinfo">
                    <div className="govuk-width-container">
                        <div className="govuk-footer__meta">
                            <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
                                <h2 className="govuk-visually-hidden">Support links</h2>
                                <ul className="govuk-footer__inline-list">
                                    <li className="govuk-footer__inline-list-item">
                                        <a className="govuk-footer__link" href="#">Help</a>
                                    </li>
                                    <li className="govuk-footer__inline-list-item">
                                        <a className="govuk-footer__link" href="#">Privacy</a>
                                    </li>
                                    <li className="govuk-footer__inline-list-item">
                                        <a className="govuk-footer__link" href="#">Cookies</a>
                                    </li>
                                    <li className="govuk-footer__inline-list-item">
                                        <a className="govuk-footer__link" href="#">Contact</a>
                                    </li>
                                    <li className="govuk-footer__inline-list-item">
                                        <a className="govuk-footer__link" href="#">Terms and conditions</a>
                                    </li>
                                    <li className="govuk-footer__inline-list-item">
                                        <a className="govuk-footer__link" href="#">Accessibility statement</a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>
        </ErrorBoundary>
    );
};

export default App;
