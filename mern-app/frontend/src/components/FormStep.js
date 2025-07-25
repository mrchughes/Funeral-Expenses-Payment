// Fully implemented real code for frontend/src/components/FormStep.js
import React from "react";

const FormStep = ({ question, value, onChange }) => {
    return (
        <div className="govuk-form-group">
            <label className="govuk-label">{question.label}</label>
            <input
                className="govuk-input"
                type="text"
                name={question.name}
                value={value}
                onChange={onChange}
            />
        </div>
    );
};

export default FormStep;
