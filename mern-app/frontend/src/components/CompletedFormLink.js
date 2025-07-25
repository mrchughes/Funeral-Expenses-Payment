// Fully implemented real code for frontend/src/components/CompletedFormLink.js
import React from "react";

const CompletedFormLink = ({ url }) => {
    return (
        <div className="govuk-panel govuk-panel--confirmation">
            <h2 className="govuk-panel__title">Form submitted successfully!</h2>
            <p>You can download your completed form here:</p>
            <a href={url} className="govuk-button" target="_blank" rel="noopener noreferrer">
                Download Form
            </a>
        </div>
    );
};

export default CompletedFormLink;
