import { getAISuggestions } from "../api/aiAgent";
import { extractFormData } from "../api/aiAgent.extract";
import React, { useState, useContext, useEffect, useCallback } from "react";
import { validatePostcode, validateNINO, validatePhoneNumber, validateEmail } from "../utils/validation";
import { useNavigate, useSearchParams, Link, useLocation } from "react-router-dom";
import AuthContext from "../auth/AuthContext";
import { autoSaveForm, getResumeData } from "../api";
import {
    getAllSectionStatuses,
    hasAnyProgress,
    saveSectionProgress,
    clearSectionProgress
} from "../utils/formProgress";
import { formSections, getConditionalFields } from '../data/formStructure';
import { clearFormData, loadFormData, saveFormData, saveFormStep, loadFormStep } from '../utils/formPersistence';
import ChatbotWidget from "../components/ChatbotWidget";
import EvidenceUpload from "../components/EvidenceUpload";
import { uploadEvidenceFile, deleteEvidenceFile, getEvidenceList } from "../api/evidence";

// Default form data structure
const defaultFormData = {
    // Personal details
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    nationalInsuranceNumber: "",
    addressLine1: "",
    addressLine2: "",
    town: "",
    county: "",
    postcode: "",
    phoneNumber: "",
    email: "",

    // Partner details
    hasPartner: "",
    partnerFirstName: "",
    partnerLastName: "",
    partnerDateOfBirth: "",
    partnerNationalInsuranceNumber: "",
    partnerBenefitsReceived: [],
    partnerSavings: "",

    // Family composition and dependents
    hasChildren: "",
    numberOfChildren: "",
    childrenDetails: "",
    hasDependents: "",
    dependentsDetails: "",
    householdSize: "",
    householdMembers: "",

    // Enhanced benefits information
    householdBenefits: [],
    incomeSupportDetails: "",
    disabilityBenefits: [],
    carersAllowance: "",
    carersAllowanceDetails: "",

    // About the person who died
    deceasedFirstName: "",
    deceasedLastName: "",
    deceasedDateOfBirth: "",
    deceasedDateOfDeath: "",
    relationshipToDeceased: "",

    // Address of the person who died
    deceasedAddressLine1: "",
    deceasedAddressLine2: "",
    deceasedTown: "",
    deceasedCounty: "",
    deceasedPostcode: "",
    deceasedUsualAddress: "",

    // Responsibility for funeral arrangements
    responsibilityReason: "",
    nextOfKin: "",
    otherResponsiblePerson: "",

    // Funeral details
    funeralDirector: "",
    funeralCost: "",
    funeralDate: "",
    funeralLocation: "",
    burialOrCremation: "",

    // Estate and assets
    estateValue: "",
    propertyOwned: "",
    propertyDetails: "",
    bankAccounts: "",
    investments: "",
    lifeInsurance: "",
    debtsOwed: "",
    willExists: "",
    willDetails: "",

    // Enhanced financial information
    benefitsReceived: [],
    employmentStatus: "",
    savings: "",
    savingsAmount: "",
    otherIncome: "",

    // Evidence and documentation
    evidence: [],

    // Declaration
    declarationAgreed: false,
    informationCorrect: false,
    notifyChanges: false
};

const FormPage = () => {
    // Helper to render the current section
    const renderSection = () => {
        const idx = currentStep - 1;
        const section = formSections[idx];
        if (!section) return <div className="govuk-error-message">Unknown step</div>;
        // Special case: evidence section
        if (section.id === 'evidence-documentation') {
            return (
                <>
                    <h2 className="govuk-heading-l">{section.title}</h2>
                    <p className="govuk-body">You can upload your documents now or come back later. By uploading now, we will extract key data and prepopulate the form for you with any extractable information.</p>
                    <div className="govuk-form-group">
                        <fieldset className="govuk-fieldset">
                            <legend className="govuk-fieldset__legend">
                                Which documents can you provide? Select all that apply.
                            </legend>
                            <div className="govuk-checkboxes">
                                {section.fields[0].options.map(doc => (
                                    <div key={doc} className="govuk-checkboxes__item">
                                        <input
                                            className="govuk-checkboxes__input"
                                            id={`evidence-${doc.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                                            name="evidence"
                                            type="checkbox"
                                            value={doc}
                                            checked={formData.evidence && formData.evidence.includes(doc)}
                                            onChange={handleChange}
                                        />
                                        <label className="govuk-label govuk-checkboxes__label" htmlFor={`evidence-${doc.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}>
                                            {doc}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </fieldset>
                    </div>
                    <EvidenceUpload
                        onUpload={handleEvidenceUpload}
                        onDelete={handleEvidenceDelete}
                        evidenceList={uploadedEvidence}
                        uploadStatus={uploadStatus}
                    />
                    {console.log('[DEBUG] FormPage rendering with uploadStatus:', uploadStatus)}
                    {evidenceUploading && (
                        <div className="govuk-inset-text" aria-live="polite">
                            <p className="govuk-body">
                                <strong>Processing documents...</strong> Please wait while we upload and analyze your files.
                            </p>
                        </div>
                    )}
                    {evidenceError && (
                        <div className="govuk-error-message" id="evidence-error" role="alert" aria-live="assertive" style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '15px', marginTop: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #f5c6cb' }}>
                            <span className="govuk-visually-hidden">Error:</span>
                            <strong>Error:</strong> {evidenceError}
                        </div>
                    )}
                    {evidenceWarning && (
                        <div className="govuk-warning-message" id="evidence-warning" role="status" aria-live="polite" style={{ color: '#594d00', backgroundColor: '#fff7bf', padding: '15px', marginBottom: '15px', border: '1px solid #ffdd00' }}>
                            <span className="govuk-visually-hidden">Warning:</span> {evidenceWarning}
                        </div>
                    )}
                    {aiLoading && <p className="govuk-body">Getting AI suggestions...</p>}
                    {aiError && <p className="govuk-error-message">{aiError}</p>}
                    {aiSuggestions && (
                        <div className="govuk-inset-text govuk-inset-text--suggested" style={{ borderLeft: '5px solid #ffbf47', background: '#fffbe6' }}>
                            <strong>Suggested by AI:</strong>
                            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#6f777b' }}>suggested: {aiSuggestions}</pre>
                            <p className="govuk-hint">You can edit or overwrite these suggestions.</p>
                        </div>
                    )}
                    <div className="govuk-inset-text">
                        <p className="govuk-body">You can upload your documents now or after submitting this application.</p>
                    </div>
                </>
            );
        }
        // Default: render fields for this section
        // Get the conditional visibility map for all fields
        const conditionalFields = getConditionalFields(formData);
        console.log('[FORM] Conditional fields for section:', section.title, conditionalFields);
        return (
            <>
                <h2 className="govuk-heading-l">{section.title}</h2>
                {section.fields.map(field => {
                    // Skip rendering if conditional check fails
                    if (field.conditional && conditionalFields[field.name] === false) {
                        console.log('[FORM] Skipping conditional field:', field.name);
                        return null;
                    }
                    // Render input based on field type (simplified for demo)
                    if (field.type === 'text' || field.type === 'date' || field.type === 'number' || field.type === 'email' || field.type === 'tel') {
                        return (
                            <div className="govuk-form-group" key={field.name}>
                                <label className="govuk-label" htmlFor={field.name}>{field.label}</label>
                                <input
                                    className="govuk-input"
                                    id={field.name}
                                    name={field.name}
                                    type={field.type}
                                    value={formData[field.name] || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        );
                    }
                    if (field.type === 'checkbox') {
                        return (
                            <div className="govuk-form-group" key={field.name}>
                                <fieldset className="govuk-fieldset">
                                    <legend className="govuk-fieldset__legend">{field.label}</legend>
                                    <div className="govuk-checkboxes">
                                        {field.options.map(opt => (
                                            <div key={opt} className="govuk-checkboxes__item">
                                                <input
                                                    className="govuk-checkboxes__input"
                                                    id={`${field.name}-${opt.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                                                    name={field.name}
                                                    type="checkbox"
                                                    value={opt}
                                                    checked={Array.isArray(formData[field.name]) && formData[field.name].includes(opt)}
                                                    onChange={handleChange}
                                                />
                                                <label className="govuk-label govuk-checkboxes__label" htmlFor={`${field.name}-${opt.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}>{opt}</label>
                                            </div>
                                        ))}
                                    </div>
                                </fieldset>
                            </div>
                        );
                    }
                    if (field.type === 'radio') {
                        return (
                            <div className="govuk-form-group" key={field.name}>
                                <fieldset className="govuk-fieldset">
                                    <legend className="govuk-fieldset__legend">{field.label}</legend>
                                    <div className="govuk-radios">
                                        {field.options.map(opt => (
                                            <div key={opt} className="govuk-radios__item">
                                                <input
                                                    className="govuk-radios__input"
                                                    id={`${field.name}-${opt.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                                                    name={field.name}
                                                    type="radio"
                                                    value={opt}
                                                    checked={formData[field.name] === opt}
                                                    onChange={handleChange}
                                                />
                                                <label className="govuk-label govuk-radios__label" htmlFor={`${field.name}-${opt.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}>{opt}</label>
                                            </div>
                                        ))}
                                    </div>
                                </fieldset>
                            </div>
                        );
                    }
                    if (field.type === 'textarea') {
                        return (
                            <div className="govuk-form-group" key={field.name}>
                                <label className="govuk-label" htmlFor={field.name}>{field.label}</label>
                                <textarea
                                    className="govuk-textarea"
                                    id={field.name}
                                    name={field.name}
                                    value={formData[field.name] || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        );
                    }
                    return null;
                })}
            </>
        );
    };
    // --- All hooks at the top for strict React rules compliance ---
    const [aiSuggestions, setAISuggestions] = useState("");
    const [aiLoading, setAILoading] = useState(false);
    const [aiError, setAIError] = useState("");
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const [uploadedEvidence, setUploadedEvidence] = useState([]); // [{name, url}]
    const [evidenceUploading, setEvidenceUploading] = useState(false);
    const [evidenceError, setEvidenceError] = useState("");
    const [evidenceWarning, setEvidenceWarning] = useState("");
    const [uploadStatus, setUploadStatus] = useState({}); // {filename: {progress, state}}
    const [processingFiles, setProcessingFiles] = useState(false); // Whether files are being processed by AI
    const [showUpdatedFieldsPopup, setShowUpdatedFieldsPopup] = useState(false);
    const [updatedFields, setUpdatedFields] = useState([]); // Form fields updated
    const [extractedFields, setExtractedFields] = useState([]); // Data fields extracted from files
    // Initial state values - will be updated in useEffect
    // (moved to top)
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // --- All useEffect and useCallback hooks next ---
    // Initialize form step based on URL params and saved data
    useEffect(() => {
        const initializeStep = () => {
            const stepParam = searchParams.get('step');
            const freshParam = searchParams.get('fresh');

            // If coming with step parameter (from Review page), use it immediately
            if (stepParam && !isNaN(parseInt(stepParam))) {
                console.log('📝 FormPage: Using step from URL (initial):', stepParam);
                return parseInt(stepParam);
            }

            // If fresh=true parameter, always start at step 1 (new application)
            if (freshParam === 'true') {
                console.log('📝 FormPage: Fresh application, clearing data and starting at step 1');
                // Clear localStorage for fresh applications
                if (user?.email) {
                    clearFormData(user?.email);
                    clearSectionProgress(user?.email);
                }
                return 1;
            }

            // For continuing applications, check if there's actual form progress
            const savedFormData = loadFormData(user?.email, {});
            const hasActualProgress = hasAnyProgress(savedFormData, formSections);

            if (hasActualProgress) {
                const savedStep = loadFormStep(user?.email) || 1;
                console.log('📝 FormPage: Has progress, using saved step:', savedStep);
                return savedStep;
            } else {
                console.log('📝 FormPage: No progress, starting at step 1');
                return 1;
            }
        };
        const initialStep = initializeStep();
        setCurrentStep(initialStep);
    }, [searchParams, user?.email]);

    // Mapping from AI-extracted keys to form field keys
    const aiToFormFieldMap = {
        // Deceased details
        "Name of deceased": "deceasedFirstName", // Will split into first/last below
        "Date of death": "deceasedDateOfDeath",
        "deceasedDateOfDeath": "deceasedDateOfDeath", // Direct field match
        "Place of death": "deceasedPlaceOfDeath",
        "Cause of death": "deceasedCauseOfDeath",
        "Certifying doctor": "deceasedCertifyingDoctor",
        "Certificate issued": "deceasedCertificateIssued",
        // Applicant details
        "Name of applicant": "firstName", // Will split into first/last below
        "Claimant": "firstName", // Will split into first/last below
        "National Insurance Number": "nationalInsuranceNumber",
        "Address": "addressLine1", // Will split if possible
        // Funeral bill
        "Funeral Director": "funeralDirector",
        "funeralDirector": "funeralDirector", // Direct field match
        "Estimate number": "funeralEstimateNumber",
        "funeralEstimateNumber": "funeralEstimateNumber", // Direct field match
        "Date issued": "funeralDateIssued",
        "funeralDateIssued": "funeralDateIssued", // Direct field match
        "Total estimated cost": "funeralTotalEstimatedCost",
        "funeralTotalEstimatedCost": "funeralTotalEstimatedCost", // Direct field match
        "Total cost": "funeralTotalEstimatedCost", // Alternative key
        "Cost": "funeralTotalEstimatedCost", // Alternative key
        "Description": "funeralDescription",
        "funeralDescription": "funeralDescription", // Direct field match
        "Contact": "funeralContact",
        "funeralContact": "funeralContact", // Direct field match
        // Relationship
        "Relationship": "relationshipToDeceased",
        "relationshipToDeceased": "relationshipToDeceased", // Direct field match
        "Supporting evidence": "supportingEvidence",
        "supportingEvidence": "supportingEvidence", // Direct field match
        // Responsibility
        "Applicant": "firstName", // Will split into first/last below
        "Relationship to deceased": "relationshipToDeceased",
        "Statement": "responsibilityStatement",
        "responsibilityStatement": "responsibilityStatement", // Direct field match
        "Date": "responsibilityDate",
        "responsibilityDate": "responsibilityDate", // Direct field match
        // Benefits
        "Benefit": "benefitType",
        "benefitType": "benefitType", // Direct field match
        "Reference number": "benefitReferenceNumber",
        "benefitReferenceNumber": "benefitReferenceNumber", // Direct field match
        "Letter date": "benefitLetterDate",
        "benefitLetterDate": "benefitLetterDate", // Direct field match
        // Specific benefits
        "Income Support": "householdBenefits",
        "Jobseeker's Allowance": "householdBenefits",
        "Employment and Support Allowance": "householdBenefits",
        "Universal Credit": "householdBenefits",
        "Pension Credit": "householdBenefits",
        // Details
        "Benefit details": "incomeSupportDetails",
        "Income Support details": "incomeSupportDetails"
    };

    // Helper to split full name into first/last
    function splitName(fullName) {
        if (!fullName) return { firstName: "", lastName: "" };
        const parts = fullName.trim().split(" ");
        if (parts.length === 1) return { firstName: parts[0], lastName: "" };
        return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join(" ") };
    }

    // Handler for evidence upload
    // Handler for evidence upload
    const handleEvidenceUpload = async (files) => {
        console.log('[EVIDENCE] handleEvidenceUpload called with files:', files);
        setEvidenceError("");
        setEvidenceWarning("");
        setEvidenceUploading(true);
        setProcessingFiles(true); // Set processing state

        // Create a new status object instead of modifying the existing one
        const filesList = Array.from(files);
        const file = filesList[0]; // Process only the first file (since we now only allow one file at a time)

        // Pre-check if the file already exists in our uploaded evidence
        const existingFile = uploadedEvidence.find(f => f.name === file.name);
        if (existingFile) {
            setEvidenceError(`A file with name "${file.name}" has already been uploaded. Please use a different file.`);
            setEvidenceUploading(false);
            setProcessingFiles(false);
            return;
        }

        // Initialize an object to track file status
        const statusTracker = { ...uploadStatus }; // Clone the current state

        console.log('[EVIDENCE] Current upload status before update:', uploadStatus);

        // Add file to the list with 0% progress
        setUploadedEvidence(prev => [...prev.filter(f => f.name !== file.name), { name: file.name }]);

        // Set initial upload status
        statusTracker[file.name] = { progress: 0, state: 'uploading' };

        // Update the state in one batch
        setUploadStatus({ ...statusTracker });
        console.log('[EVIDENCE] Initial status tracker:', statusTracker);

        try {
            console.log(`[EVIDENCE] Processing file ${file.name}`);

            // STEP 1: Upload the file
            // Track progress for this file
            const handleProgress = (percent, filename) => {
                console.log(`[EVIDENCE] Progress update for ${filename}: ${percent}%`);
                // Update our status tracker
                statusTracker[filename] = { progress: percent, state: 'uploading' };
                // Update React state with the current state of statusTracker
                setUploadStatus({ ...statusTracker });
            };

            // Upload the file
            console.log(`[EVIDENCE] Starting upload for ${file.name}`);
            let res;
            try {
                res = await uploadEvidenceFile(file, user?.token, handleProgress);

                // Check if there's an error in the response
                if (res.error) {
                    console.error(`[EVIDENCE] Upload error for ${file.name}:`, res.error);
                    statusTracker[file.name] = { progress: 0, state: 'error' };
                    setUploadStatus({ ...statusTracker });

                    // Check for duplicate file error
                    if (res.error.includes('already been uploaded')) {
                        setEvidenceError(`The file "${file.name}" has already been uploaded. Please check the evidence list and use a different file.`);
                        // Refresh the evidence list to ensure we have the latest files
                        loadEvidenceList();
                    } else {
                        setEvidenceError(res.error);
                    }

                    setEvidenceUploading(false);
                    setProcessingFiles(false);
                    return;
                }
            } catch (err) {
                console.error(`[EVIDENCE] Upload exception for ${file.name}:`, err);
                statusTracker[file.name] = { progress: 0, state: 'error' };
                setUploadStatus({ ...statusTracker });
                setEvidenceError(`Failed to upload ${file.name}: ${err.message || 'Unknown error'}`);
                setEvidenceUploading(false);
                setProcessingFiles(false);
                return;
            }

            // Mark as complete in our tracker
            statusTracker[file.name] = { progress: 100, state: 'complete' };
            setUploadStatus({ ...statusTracker });
            console.log(`[EVIDENCE] File upload complete for ${file.name}`);

            // Update evidence list with URL
            setUploadedEvidence(prev =>
                prev.map(item =>
                    item.name === res.name
                        ? { ...item, url: res.url }
                        : item
                )
            );

            // STEP 2: Extract data from this file
            console.log(`[EVIDENCE] Starting extraction for ${file.name}`);

            // Update status to extracting for this file with initial step
            statusTracker[file.name] = { progress: 100, state: 'extracting', step: 'OCR Text Extraction' };
            setUploadStatus({ ...statusTracker });

            // Extract the userId from the URL - the fileId should be the userId from the URL path
            const urlParts = res.url.split('/');
            const userId = urlParts[urlParts.length - 2]; // Get the userId part

            // The fileId in the shared directory will be userId_filename
            const fileId = `${userId}_${file.name}`;
            console.log(`[EVIDENCE] Generated fileId for extraction: ${fileId}`);

            // Update status to show we're sending to AI
            statusTracker[file.name] = { progress: 100, state: 'extracting', step: 'Sending to AI Analysis' };
            setUploadStatus({ ...statusTracker });

            // Call AI extraction just for this file
            const result = await extractFormData(user?.token, fileId);
            console.log(`[EVIDENCE] AI extraction result for ${file.name}:`, result);

            // Update status to show we're analyzing the document
            statusTracker[file.name] = { progress: 100, state: 'extracting', step: 'Analyzing Document Content' };
            setUploadStatus({ ...statusTracker });

            // Check if result has expected format
            if (!result || !result.extracted) {
                console.error(`[EVIDENCE] Invalid extraction result format for ${file.name}`);
                setEvidenceError(`AI extraction returned invalid data format for ${file.name}`);

                // Mark failed extraction in status
                statusTracker[file.name] = { progress: 100, state: 'extraction-failed' };
                setUploadStatus({ ...statusTracker });
                setEvidenceUploading(false);
                setProcessingFiles(false);
                return;
            }

            // STEP 3: Process the extracted data
            statusTracker[file.name] = { progress: 100, state: 'extracting', step: 'Mapping Data to Form Fields' };
            setUploadStatus({ ...statusTracker });

            let merged = { ...formData };
            let changedFields = [];
            let extractedFieldInfo = {};
            let extractedFieldNames = new Set();

            // Process extraction result for the current file
            // The key could be either the original filename or the fileId
            const possibleKeys = [
                file.name,               // Original filename
                fileId,                  // userId_filename
                `${userId}_${file.name}` // Explicit userId_filename
            ];

            let foundExtraction = false;
            let val = null;

            for (const key of possibleKeys) {
                if (result.extracted[key]) {
                    val = result.extracted[key];
                    console.log(`[EVIDENCE] Found extraction data with key: ${key}`);
                    foundExtraction = true;
                    break;
                }
            }

            if (foundExtraction && val) {
                console.log(`[EVIDENCE] Processing extraction for ${file.name}`);

                try {
                    let obj;
                    try {
                        // Handle string vs object response
                        obj = typeof val === 'string' ? JSON.parse(val) : val;
                    } catch (parseErr) {
                        console.error(`[EVIDENCE] Failed to parse JSON from ${file.name}:`, parseErr);
                        statusTracker[file.name] = { progress: 100, state: 'extraction-failed' };
                        setUploadStatus({ ...statusTracker });
                        setEvidenceUploading(false);
                        setProcessingFiles(false);
                        return;
                    }

                    // Handle the case where the extraction failed or returned a warning
                    if (obj._error || obj._warning) {
                        const message = obj._error || obj._warning;
                        console.warn(`[EVIDENCE] Extraction issue for ${file.name}:`, message);

                        // Mark warning in status but continue processing
                        statusTracker[file.name] = { progress: 100, state: 'extraction-warning' };
                        setUploadStatus({ ...statusTracker });
                        setEvidenceWarning(`Warning during extraction: ${message}`);
                        setEvidenceUploading(false);
                        setProcessingFiles(false);
                        return;
                    }

                    Object.entries(obj).forEach(([k, v]) => {
                        // v is expected to be { value, reasoning }
                        if (!v || !v.value) {
                            console.log(`[EVIDENCE] Skipping empty value for field: ${k}`);
                            return;
                        }

                        let mappedKey = aiToFormFieldMap[k] || k;
                        if (!aiToFormFieldMap[k]) {
                            const lowerK = k.toLowerCase();
                            const ciMatch = Object.keys(aiToFormFieldMap).find(
                                key => key.toLowerCase() === lowerK
                            );
                            if (ciMatch) mappedKey = aiToFormFieldMap[ciMatch];
                        }

                        extractedFieldInfo[mappedKey] = { value: v.value, reasoning: v.reasoning };
                        extractedFieldNames.add(mappedKey);

                        // Special handling for names
                        if (["Name of deceased", "Name of applicant", "Claimant", "Applicant"].includes(k)) {
                            const { firstName, lastName } = splitName(v.value);
                            if (k === "Name of deceased") {
                                if (merged.deceasedFirstName !== firstName) changedFields.push("deceasedFirstName");
                                if (merged.deceasedLastName !== lastName) changedFields.push("deceasedLastName");
                                merged.deceasedFirstName = firstName;
                                merged.deceasedLastName = lastName;
                            } else {
                                if (merged.firstName !== firstName) changedFields.push("firstName");
                                if (merged.lastName !== lastName) changedFields.push("lastName");
                                merged.firstName = firstName;
                                merged.lastName = lastName;
                            }
                        } else if (k === "Address") {
                            const addressParts = v.value.split(',').map(part => part.trim());
                            if (addressParts.length === 3) {
                                merged.addressLine1 = addressParts[0];
                                merged.town = addressParts[1];
                                merged.postcode = addressParts[2];
                                changedFields.push("addressLine1", "town", "postcode");
                            } else if (addressParts.length === 2) {
                                merged.addressLine1 = addressParts[0];
                                merged.postcode = addressParts[1];
                                changedFields.push("addressLine1", "postcode");
                            } else {
                                merged.addressLine1 = v.value;
                                changedFields.push("addressLine1");
                            }
                        } else if (["Income Support", "Jobseeker's Allowance", "Employment and Support Allowance", "Universal Credit", "Pension Credit"].includes(k)) {
                            if (!Array.isArray(merged.householdBenefits)) merged.householdBenefits = [];
                            if (!merged.householdBenefits.includes(k)) {
                                merged.householdBenefits.push(k);
                                changedFields.push("householdBenefits");
                            }
                        } else if (["Benefit details", "Income Support details"].includes(k)) {
                            if (merged[mappedKey] !== v.value) changedFields.push(mappedKey);
                            merged[mappedKey] = v.value;
                        } else if (mappedKey === "funeralTotalEstimatedCost") {
                            // Special handling for funeral cost - ensure we keep only the numeric part
                            let costValue = v.value;
                            // Remove currency symbols, commas, and extract the number
                            const costMatch = costValue.toString().replace(/[£$,]/g, '').match(/(\d+(\.\d+)?)/);
                            if (costMatch && costMatch[1]) {
                                costValue = costMatch[1];
                                console.log(`[EVIDENCE] Extracted funeral cost: ${costValue} from ${v.value}`);
                            }
                            if (merged[mappedKey] !== costValue) changedFields.push(mappedKey);
                            merged[mappedKey] = costValue;
                        } else if (["deceasedDateOfDeath", "funeralDateIssued", "benefitLetterDate", "responsibilityDate"].includes(mappedKey)) {
                            // Special handling for date fields
                            let dateValue = v.value;
                            // Check if date is in a recognizable format and convert if needed
                            const dateMatch = dateValue.toString().match(/(\d{1,2})[\/\-\s](\d{1,2}|[A-Za-z]+)[\/\-\s](\d{2,4})/);
                            if (dateMatch) {
                                console.log(`[EVIDENCE] Found date format in ${dateValue}: ${dateMatch[0]}`);
                                // Just store the matched date string - conversion can happen in UI
                            }
                            if (merged[mappedKey] !== dateValue) changedFields.push(mappedKey);
                            merged[mappedKey] = dateValue;
                        } else {
                            if (merged[mappedKey] !== v.value) changedFields.push(mappedKey);
                            merged[mappedKey] = v.value;
                        }
                    });
                } catch (e) {
                    console.error(`[EVIDENCE] Error processing extraction for ${file.name}:`, e);
                    statusTracker[file.name] = { progress: 100, state: 'extraction-failed' };
                    setUploadStatus({ ...statusTracker });
                    setEvidenceError(`Error processing extraction for ${file.name}: ${e.message}`);
                    setEvidenceUploading(false);
                    setProcessingFiles(false);
                    return;
                }
            } else {
                console.log(`[EVIDENCE] No extraction data found for ${file.name}`);

                // Check if it contains the "No relevant data found" error or warning
                if (result.extracted[file.name] && typeof result.extracted[file.name] === 'string' &&
                    (result.extracted[file.name].includes("No relevant data found") ||
                        result.extracted[file.name].includes("_warning"))) {

                    // Try to parse it for any useful information
                    try {
                        const parsedResult = JSON.parse(result.extracted[file.name]);

                        // Check for document type information from filename
                        if (parsedResult._documentType && parsedResult._documentType.value) {
                            console.log(`[EVIDENCE] Document type detected from filename: ${parsedResult._documentType.value}`);

                            // Update evidence type in the form data
                            if (parsedResult._documentType.value.toLowerCase().includes("death certificate")) {
                                merged.evidenceType = "deathCertificate";
                                changedFields.push("evidenceType");
                            } else if (parsedResult._documentType.value.toLowerCase().includes("benefit")) {
                                merged.evidenceType = "benefitLetter";
                                changedFields.push("evidenceType");
                            } else if (parsedResult._documentType.value.toLowerCase().includes("funeral")) {
                                merged.evidenceType = "funeralInvoice";
                                changedFields.push("evidenceType");
                            }
                        }
                    } catch (e) {
                        console.log(`[EVIDENCE] Error parsing warning JSON: ${e}`);
                    }

                    // Set a warning instead of an error
                    setEvidenceWarning(`Limited text could be extracted from ${file.name}. The file was uploaded successfully, but we couldn't automatically fill any form fields.`);

                    // Mark as successful upload with warning
                    statusTracker[file.name] = { progress: 100, state: 'extraction-limited' };
                    setUploadStatus({ ...statusTracker });
                }
            }

            console.log(`[AI->FORM] Merged formData after mapping for ${file.name}:`, merged);

            try {
                window.localStorage.setItem('debug_lastMergedFormData', JSON.stringify(merged));
            } catch (e) {
                console.error('[AI->FORM] Failed to store debug data:', e);
            }

            // Update status to show we're finalizing the data
            statusTracker[file.name] = { progress: 100, state: 'extracting', step: 'Finalizing Data' };
            setUploadStatus({ ...statusTracker });

            // Update form data with merged values
            setFormData(merged);

            // Persist extracted data to backend for first-time ingest
            if ((extractedFieldNames.size > 0 || changedFields.length > 0) && user?.token) {
                try {
                    console.log(`[AI->FORM][DEBUG] About to call autoSaveForm with data from ${file.name}:`, merged);
                    const saveResp = await autoSaveForm(merged, user.token);
                    console.log('[AI->FORM][DEBUG] autoSaveForm response:', saveResp);
                    console.log(`[AI->FORM] Successfully saved extracted data from ${file.name} to backend`);
                } catch (err) {
                    console.error('[AI->FORM][DEBUG] autoSaveForm error:', err);
                    console.warn(`Failed to persist extracted data from ${file.name}:`, err);
                }
            }

            // If no data was extracted, just update status
            if (Object.keys(extractedFieldInfo).length === 0 && changedFields.length === 0) {
                console.log(`[AI->FORM] No fields were extracted or changed from ${file.name}`);
                // Set warning but don't treat as error - the file was uploaded successfully
                // Just not able to extract useful data
                setEvidenceWarning(`No relevant data could be extracted from ${file.name}. The file was uploaded successfully.`);

                // Don't show popup, just update status
                statusTracker[file.name] = {
                    progress: 100,
                    state: 'processed',
                    extractedCount: 0
                };
                setUploadStatus({ ...statusTracker });
                setEvidenceUploading(false);
                setProcessingFiles(false);
                return;
            }

            // Show popup with field updates if we have any
            console.log(`[AI->FORM][POPUP] changedFields from ${file.name}:`, changedFields, 'merged:', merged);
            setExtractedFields(extractedFieldInfo);
            setUpdatedFields(changedFields);
            setShowUpdatedFieldsPopup(true);

            // Update status to show processed successfully with field count
            const extractedCount = changedFields.length;
            statusTracker[file.name] = {
                progress: 100,
                state: 'processed',
                extractedCount: extractedCount
            };
            setUploadStatus({ ...statusTracker });

        } catch (err) {
            console.error(`[EVIDENCE] Processing failed for ${file.name}:`, err);

            // Determine a more specific error message if possible
            let errorMessage = `Failed to process ${file.name}`;
            if (err.message?.includes('size')) {
                errorMessage = `File ${file.name} exceeds the maximum allowed size (25MB)`;
            } else if (err.message?.includes('type') || err.message?.includes('extension')) {
                errorMessage = `File type for ${file.name} is not supported. Use PDF, JPG, PNG, or DOCX.`;
            } else if (err.message?.includes('already been uploaded')) {
                errorMessage = `File ${file.name} has already been uploaded. Please use a different file.`;
            }

            setEvidenceError(errorMessage);

            // Mark as error in our tracker
            statusTracker[file.name] = { progress: 0, state: 'error' };
            setUploadStatus({ ...statusTracker });
        } finally {
            // Always turn off the uploading state when done
            setEvidenceUploading(false);
            setProcessingFiles(false);
        }
    };

    // Handler for evidence delete
    const handleEvidenceDelete = (filename) => {
        setEvidenceError("");
        setEvidenceUploading(true);
        deleteEvidenceFile(filename, user?.token)
            .then(() => {
                setUploadedEvidence(prev => prev.filter(f => f.name !== filename));
                // Also remove the file from the upload status
                setUploadStatus(prev => {
                    const newStatus = { ...prev };
                    delete newStatus[filename];
                    return newStatus;
                });
            })
            .catch(() => setEvidenceError(`Failed to delete ${filename}`))
            .finally(() => setEvidenceUploading(false));
    };

    // Initial state values - will be updated in useEffect
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState(defaultFormData);

    // Initialize form step based on URL params and saved data
    useEffect(() => {
        const initializeStep = () => {
            const stepParam = searchParams.get('step');
            const freshParam = searchParams.get('fresh');

            // If coming with step parameter (from Review page), use it immediately
            if (stepParam && !isNaN(parseInt(stepParam))) {
                console.log('📝 FormPage: Using step from URL (initial):', stepParam);
                return parseInt(stepParam);
            }

            // If fresh=true parameter, always start at step 1 (new application)
            if (freshParam === 'true') {
                console.log('📝 FormPage: Fresh application, clearing data and starting at step 1');
                // Clear localStorage for fresh applications
                if (user?.email) {
                    clearFormData(user?.email);
                    clearSectionProgress(user?.email);
                }
                return 1;
            }

            // For continuing applications, check if there's actual form progress
            const savedFormData = loadFormData(user?.email, {});
            const hasActualProgress = hasAnyProgress(savedFormData, formSections);

            if (hasActualProgress) {
                const savedStep = loadFormStep(user?.email) || 1;
                console.log('📝 FormPage: Has progress, using saved step:', savedStep);
                return savedStep;
            } else {
                console.log('📝 FormPage: No progress, starting at step 1');
                return 1;
            }
        };

        const initialStep = initializeStep();
        setCurrentStep(initialStep);
    }, [searchParams, user?.email]);
    // (moved to top)

    // Function to load previously uploaded evidence
    const loadEvidenceList = useCallback(async () => {
        if (!user?.token) return;

        try {
            console.log('[EVIDENCE] Loading evidence list');
            const result = await getEvidenceList(user.token);

            if (result && result.evidence && result.evidence.length > 0) {
                const files = result.evidence;
                console.log(`[EVIDENCE] Loaded ${files.length} evidence files:`, files);

                // Create status entries for all files
                const newStatus = {};
                files.forEach(file => {
                    newStatus[file.name] = { progress: 100, state: 'complete' };
                });

                setUploadedEvidence(files);
                setUploadStatus(newStatus);
            } else {
                console.log('[EVIDENCE] No evidence files found');
                setUploadedEvidence([]);
            }
        } catch (error) {
            console.error('[EVIDENCE] Error loading evidence list:', error);
            setEvidenceError('Failed to load previously uploaded evidence. Please try again.');
        }
    }, [user?.token]);

    // Load evidence on initial component mount and whenever the user navigates to the form
    useEffect(() => {
        if (user?.token) {
            console.log('[EVIDENCE] Initial evidence load triggered');
            loadEvidenceList();
        }
    }, [user?.token, loadEvidenceList, location.pathname]);

    // Load evidence whenever the user navigates to the evidence section
    useEffect(() => {
        const currentSection = formSections[currentStep - 1];
        if (currentSection && currentSection.id === 'evidence-documentation') {
            console.log('[EVIDENCE] Evidence section detected, loading evidence list');
            loadEvidenceList();
        }
    }, [currentStep, loadEvidenceList, formSections]);

    // On first entry to evidence step, fetch AI suggestions if evidence exists and not already fetched
    useEffect(() => {
        if (currentStep === 12 && uploadedEvidence.length > 0 && !aiSuggestions && !aiLoading) {
            setAILoading(true);
            setAIError("");
            getAISuggestions(formData, user?.token)
                .then(res => setAISuggestions(res.suggestions))
                .catch(() => setAIError("Could not fetch AI suggestions"))
                .finally(() => setAILoading(false));
        }
    }, [currentStep, uploadedEvidence, aiSuggestions, aiLoading, formData, user?.token]);

    // Load data from database on component mount
    useEffect(() => {
        const loadFormDataFromDatabase = async () => {
            if (!user?.token) {
                setIsLoadingData(false);
                return;
            }

            const freshParam = searchParams.get('fresh');
            const stepParam = searchParams.get('step');

            console.log('[FORM] Loading data with params:', { freshParam, stepParam });

            // If this is a fresh application, clear existing data and start over
            if (freshParam === 'true') {
                console.log('[FORM] Fresh application - clearing all existing data');
                // Clear all localStorage data
                clearFormData(user?.email);
                clearSectionProgress(user?.email);
                // Set clean state
                setFormData(defaultFormData);
                setCurrentStep(1);
                // Save clean defaults to localStorage 
                saveFormData(user?.email, defaultFormData);
                saveFormStep(user?.email, 1);
                setIsLoadingData(false);
                return;
            }

            try {
                // Always try to load existing data first
                console.log('[FORM] Attempting to load data from database...');
                const savedData = await getResumeData(user.token);
                let loadedFormData = defaultFormData;

                if (savedData && savedData.formData) {
                    console.log('[FORM] Successfully loaded data from database:', savedData);
                    loadedFormData = { ...defaultFormData, ...savedData.formData };
                    // Ensure checkbox array fields are always arrays, not null/undefined
                    const arrayFields = [
                        'evidence',
                        'benefitsReceived',
                        'partnerBenefitsReceived',
                        'householdBenefits',
                        'disabilityBenefits'
                    ];
                    arrayFields.forEach(field => {
                        if (!Array.isArray(loadedFormData[field])) {
                            loadedFormData[field] = [];
                        }
                    });
                    console.log('[FORM] Merged formData with defaults (arrays sanitized):', loadedFormData);
                } else {
                    // Fallback to localStorage
                    console.log('[FORM] No data found in database, falling back to localStorage');
                    loadedFormData = loadFormData(user?.email, defaultFormData);
                }

                // Debug: show all keys with non-empty values
                const nonEmpty = Object.fromEntries(
                    Object.entries(loadedFormData)
                        .filter(([k, v]) => v && v !== "" && (!Array.isArray(v) || v.length > 0))
                );
                console.log('[FORM] Non-empty form fields:', nonEmpty);

                setFormData(loadedFormData);
                // Also save to localStorage for offline access
                saveFormData(user?.email, loadedFormData);

                // If navigating to specific step (from Review page), set the step after data is loaded
                if (stepParam && !isNaN(parseInt(stepParam))) {
                    const targetStep = parseInt(stepParam);
                    console.log('[FORM] Setting step after data load:', targetStep);
                    setCurrentStep(targetStep);
                    saveFormStep(user?.email, targetStep);
                }

            } catch (error) {
                console.warn('[FORM] Error loading data from database:', error);
                // Fallback to localStorage
                const localData = loadFormData(user?.email, defaultFormData);
                console.log('[FORM] Loaded data from localStorage:', localData);
                setFormData(localData);

                // Set step for navigation even with localStorage data
                if (stepParam && !isNaN(parseInt(stepParam))) {
                    const targetStep = parseInt(stepParam);
                    console.log('[FORM] Setting step with localStorage data:', targetStep);
                    setCurrentStep(targetStep);
                    saveFormStep(user?.email, targetStep);
                }
            } finally {
                setIsLoadingData(false);
            }
        };

        loadFormDataFromDatabase();
    }, [user?.token, user?.email, searchParams]);

    // Save form data to localStorage whenever it changes (but only after initial load)
    useEffect(() => {
        // Don't save if we're still loading initial data
        if (isLoadingData) return;

        console.log('[FORM SAVE] Saving form data to localStorage:', formData);
        saveFormData(user?.email, formData);
        // Do NOT update section/task completion here. Only update on explicit user save/submit.
    }, [formData, user?.email, isLoadingData]);

    // Save current step to localStorage whenever it changes
    useEffect(() => {
        saveFormStep(user?.email, currentStep);
    }, [currentStep, user?.email]);

    // Check if user should be redirected to task list
    useEffect(() => {
        const freshParam = searchParams.get('fresh');
        console.log('📝 FormPage redirect check:', {
            userEmail: user?.email,
            stepParam: searchParams.get('step'),
            freshParam,
            currentStep,
            pathname: location.pathname
        }); // Debug log

        // Don't redirect if this is a fresh application
        if (freshParam === 'true') {
            console.log('📝 FormPage: Fresh application, skipping redirect to tasks');
            return;
        }

        // Only redirect if user is actually on the /form route and not fresh
        if (user?.email && !searchParams.get('step') && location.pathname === '/form') {
            const savedData = loadFormData(user?.email, {});
            const hasProgress = hasAnyProgress(savedData, formSections);
            console.log('📝 FormPage progress check:', { hasProgress, currentStep }); // Debug log

            if (hasProgress && currentStep === 1) {
                console.log('📝 FormPage redirecting to tasks'); // Debug log
                // User has progress and isn't coming from a specific step, show task list
                navigate('/tasks');
                return;
            }
        }
    }, [user?.email, searchParams, currentStep, navigate, location.pathname]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;

        if (type === 'checkbox') {
            if (name === 'evidence' || name === 'benefitsReceived' || name === 'partnerBenefitsReceived' ||
                name === 'householdBenefits' || name === 'disabilityBenefits') {
                const currentValues = formData[name] || [];
                const newValue = checked
                    ? [...currentValues, value]
                    : currentValues.filter(v => v !== value);
                setFormData(prev => ({ ...prev, [name]: newValue }));
            } else {
                // For boolean checkboxes like declarations
                setFormData(prev => ({ ...prev, [name]: checked }));
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }

        // Clear error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: "" }));
        }
    };

    const validateStep = (step) => {
        const stepErrors = {};
        if (step === 1) {
            if (!formData.evidence || formData.evidence.length === 0) {
                stepErrors.evidence = "Select at least one document you can provide";
            }
        }
        if (step === 2) {
            if (!formData.firstName) stepErrors.firstName = "Enter your first name";
            if (!formData.lastName) stepErrors.lastName = "Enter your last name";
            if (!formData.dateOfBirth) stepErrors.dateOfBirth = "Enter your date of birth";
            if (!formData.nationalInsuranceNumber) stepErrors.nationalInsuranceNumber = "Enter your National Insurance number";
            else if (!validateNINO(formData.nationalInsuranceNumber)) stepErrors.nationalInsuranceNumber = "Enter a valid National Insurance number";
        }
        if (step === 3) {
            if (!formData.addressLine1) stepErrors.addressLine1 = "Enter your address line 1";
            if (!formData.town) stepErrors.town = "Enter your town or city";
            if (!formData.postcode) stepErrors.postcode = "Enter your postcode";
            else if (!validatePostcode(formData.postcode)) stepErrors.postcode = "Enter a valid UK postcode";
            if (!formData.phoneNumber) stepErrors.phoneNumber = "Enter your phone number";
            else if (!validatePhoneNumber(formData.phoneNumber)) stepErrors.phoneNumber = "Enter a valid phone number";
            if (!formData.email) stepErrors.email = "Enter your email address";
            else if (!validateEmail(formData.email)) stepErrors.email = "Enter a valid email address";
        }

        if (step === 4) {
            if (!formData.hasPartner) stepErrors.hasPartner = "Select whether the person who died had a partner";

            // Only validate partner details if they have a partner
            if (formData.hasPartner === 'yes') {
                if (!formData.partnerFirstName) stepErrors.partnerFirstName = "Enter the partner's first name";
                if (!formData.partnerLastName) stepErrors.partnerLastName = "Enter the partner's last name";
                if (!formData.partnerDateOfBirth) stepErrors.partnerDateOfBirth = "Enter the partner's date of birth";
                if (!formData.partnerNationalInsuranceNumber) stepErrors.partnerNationalInsuranceNumber = "Enter the partner's National Insurance number";
            }
        }

        if (step === 5) {
            if (!formData.hasChildren) stepErrors.hasChildren = "Select whether you have children";
            if (formData.hasChildren === 'yes' && !formData.numberOfChildren) {
                stepErrors.numberOfChildren = "Enter the number of children";
            }
            if (formData.hasChildren === 'yes' && !formData.childrenDetails) {
                stepErrors.childrenDetails = "Provide details about your children";
            }
            if (!formData.householdSize) stepErrors.householdSize = "Enter your household size";
        }

        if (step === 6) {
            // Enhanced benefits is optional but if household benefits selected, need details
            if (formData.householdBenefits?.includes('Income Support') && !formData.incomeSupportDetails) {
                stepErrors.incomeSupportDetails = "Please provide details about Income Support";
            }
            // If carer's allowance is yes, need details
            if (formData.carersAllowance === 'yes' && !formData.carersAllowanceDetails) {
                stepErrors.carersAllowanceDetails = "Please provide details about who you care for";
            }
        }

        if (step === 7) {
            if (!formData.deceasedFirstName) stepErrors.deceasedFirstName = "Enter the deceased person's first name";
            if (!formData.deceasedLastName) stepErrors.deceasedLastName = "Enter the deceased person's last name";
            if (!formData.deceasedDateOfBirth) stepErrors.deceasedDateOfBirth = "Enter the deceased person's date of birth";
            if (!formData.deceasedDateOfDeath) stepErrors.deceasedDateOfDeath = "Enter the deceased person's date of death";
            if (!formData.relationshipToDeceased) stepErrors.relationshipToDeceased = "Select your relationship to the deceased";
        }

        if (step === 8) {
            if (!formData.deceasedAddressLine1) stepErrors.deceasedAddressLine1 = "Enter the deceased person's address line 1";
            if (!formData.deceasedTown) stepErrors.deceasedTown = "Enter the deceased person's town or city";
            if (!formData.deceasedPostcode) stepErrors.deceasedPostcode = "Enter the deceased person's postcode";
            else if (!validatePostcode(formData.deceasedPostcode)) stepErrors.deceasedPostcode = "Enter a valid UK postcode";
        }

        if (step === 9) {
            if (!formData.responsibilityReason) stepErrors.responsibilityReason = "Select why you are responsible for the funeral";
        }

        if (step === 10) {
            if (!formData.funeralDirector) stepErrors.funeralDirector = "Enter the funeral director's name";
            if (!formData.funeralCost) stepErrors.funeralCost = "Enter the funeral cost";
            if (!formData.burialOrCremation) stepErrors.burialOrCremation = "Select burial or cremation";
        }

        if (step === 11) {
            // Estate and assets - mostly optional but validate if estate value is high
            if (formData.estateValue === 'over-5000' && !formData.propertyOwned) {
                stepErrors.propertyOwned = "Please specify if property is owned";
            }
            // If property is owned, need details
            if (formData.propertyOwned === 'yes' && !formData.propertyDetails) {
                stepErrors.propertyDetails = "Please provide details about the property owned";
            }
            // If will exists, need details
            if (formData.willExists === 'yes' && !formData.willDetails) {
                stepErrors.willDetails = "Please provide details about the will";
            }
        }

        if (step === 12) {
            if (!formData.benefitsReceived || formData.benefitsReceived.length === 0) {
                stepErrors.benefitsReceived = "Select at least one benefit you receive or 'None of these'";
            }
            if (!formData.savings) stepErrors.savings = "Select whether you have more than £16,000 in savings";
            // If high savings, need approximate amount
            if (formData.savings === 'yes' && !formData.savingsAmount) {
                stepErrors.savingsAmount = "Please provide an approximate amount of your savings";
            }
        }

        if (step === 13) {
            if (!formData.informationCorrect) stepErrors.informationCorrect = "You must confirm the information is correct";
            if (!formData.notifyChanges) stepErrors.notifyChanges = "You must agree to notify of changes";
            if (!formData.declarationAgreed) stepErrors.declarationAgreed = "You must agree to the terms and conditions";
        }

        setErrors(stepErrors);
        return Object.keys(stepErrors).length === 0;
    };

    const handleNext = async () => {
        // Clear any warnings or errors when moving to next page
        setEvidenceWarning('');
        setEvidenceError('');

        // Check if the current step is valid
        if (validateStep(currentStep)) {
            setLoading(true);
            try {
                // Check if we came from the review page
                const returnTo = searchParams.get('returnTo');

                if (returnTo === 'review') {
                    const saveResult = await autoSaveToDatabase();
                    console.log('[FORM] Returning to review page after save attempt, result:', saveResult);
                    navigate("/review");
                } else if (currentStep < 13) {
                    // Try to save but continue even if it fails
                    const saveResult = await autoSaveToDatabase();
                    console.log('[FORM] Save attempt before next step, result:', saveResult);
                    // Always save the current step to localStorage
                    const nextStep = currentStep + 1;
                    saveFormStep(user?.email, nextStep);
                    setCurrentStep(nextStep);
                }
            } catch (error) {
                console.error('[FORM] Error during form navigation:', error);
                // Log the error but still allow continuing
                setErrors({ general: "An error occurred while saving, but you can continue." });
                // If we have an error, still move to the next step
                if (currentStep < 13) {
                    const nextStep = currentStep + 1;
                    saveFormStep(user?.email, nextStep);
                    setCurrentStep(nextStep);
                }
            } finally {
                setLoading(false);
            }
        }
    };

    const handlePrevious = () => {
        // Check if we came from the review page
        const returnTo = searchParams.get('returnTo');

        if (returnTo === 'review') {
            // Return to review page without saving (user is going back)
            console.log('📝 FormPage: Returning to review page (going back)');
            navigate("/review");
        } else if (currentStep > 1) {
            // Normal progression to previous step
            autoSaveToDatabase();
            setCurrentStep(currentStep - 1);
        }
    };

    // Auto-save function to database
    const autoSaveToDatabase = async () => {
        // Don't auto-save if we're still loading initial data or user not authenticated
        if (!user?.token || isLoadingData) return;

        // If on evidence section, include uploaded evidence files in formData
        let dataToSave = { ...formData };
        if (formSections[currentStep - 1]?.id === 'evidence-documentation') {
            dataToSave.evidenceFiles = uploadedEvidence.map(f => f.name);
        }

        try {
            console.log('[FORM] Saving form data to database:', dataToSave);
            const response = await autoSaveForm(dataToSave, user.token);
            console.log('[FORM] Form auto-saved to database, response:', response);
            // Also save to localStorage as backup
            saveFormData(user?.email, dataToSave);
            // Do NOT update section/task completion here. Only update on explicit user save/submit.
            return true;
        } catch (error) {
            console.warn('[FORM] Auto-save to database failed:', error);
            // Continue using localStorage as fallback
            saveFormData(user?.email, dataToSave);
            return true; // Return true to allow continue even if save fails
        }
    };

    const handleSubmit = async () => {
        if (validateStep(currentStep)) {
            setLoading(true);
            try {
                // Auto-save current progress before redirecting to review
                await autoSaveToDatabase();
                // Update section/task completion status ONLY on explicit save/submit
                if (user?.email) {
                    const sectionStatuses = getAllSectionStatuses(formData, formSections);
                    saveSectionProgress(user?.email, sectionStatuses);
                }
                // Navigate to review page
                navigate("/review");
            } catch (error) {
                console.error('Error saving form data:', error);
                setErrors({ general: "Failed to save form data. Please try again." });
            } finally {
                setLoading(false);
            }
        }
    };

    // Handle sign out action
    const handleSignOut = (e) => {
        e.preventDefault();
        if (window.confirm('Are you sure you want to sign out? Unsaved changes may be lost.')) {
            window.localStorage.removeItem('user');
            window.location.href = '/';
        }
    };

    const hasErrors = Object.keys(errors).length > 0;

    // The component's JSX
    // We'll only use a conditional render inside the main return statement
    // instead of having an early return that would violate React hooks rules
    return (
        <>
            {isLoadingData ? (
                <div className="govuk-width-container">
                    <main className="govuk-main-wrapper" id="main-content" role="main">
                        <div className="govuk-grid-row">
                            <div className="govuk-grid-column-two-thirds">
                                <h1 className="govuk-heading-xl">Loading your application...</h1>
                                <p className="govuk-body">Please wait while we retrieve your saved progress.</p>
                            </div>
                        </div>
                    </main>
                </div>
            ) : (
                <>
                    {showUpdatedFieldsPopup && (
                        <div style={{
                            position: 'fixed',
                            top: 30,
                            right: 30,
                            zIndex: 9999,
                            background: '#222',
                            color: '#fff',
                            padding: '18px 28px',
                            borderRadius: 10,
                            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
                            fontSize: 16,
                            maxWidth: 600,
                            minWidth: 350
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <b>AI Document Ingest Results</b>
                                <button
                                    onClick={() => setShowUpdatedFieldsPopup(false)}
                                    style={{
                                        background: 'transparent',
                                        color: '#fff',
                                        border: 'none',
                                        fontSize: 20,
                                        cursor: 'pointer',
                                        marginLeft: 16
                                    }}
                                    aria-label="Close popup"
                                >
                                    ×
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: 32, marginTop: 12 }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Extracted Data Fields & Reasoning</div>
                                    <ul style={{ margin: 0, padding: 0, listStyle: 'disc inside' }}>
                                        {extractedFields && Object.keys(extractedFields).length > 0 ? (
                                            Object.entries(extractedFields).map(([field, info]) => (
                                                <li key={field}>
                                                    <strong>{field}:</strong> {info.value}
                                                    <br />
                                                    <span style={{ color: '#888', fontSize: '0.95em' }}><em>{info.reasoning}</em></span>
                                                </li>
                                            ))
                                        ) : <li style={{ color: '#aaa' }}>None</li>}
                                    </ul>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Form Fields Updated</div>
                                    <ul style={{ margin: 0, padding: 0, listStyle: 'disc inside' }}>
                                        {updatedFields.length > 0 ? updatedFields.map(f => <li key={f}>{f}</li>) : <li style={{ color: '#aaa' }}>None</li>}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="govuk-width-container">
                        <main className="govuk-main-wrapper" id="main-content" role="main">
                            <div className="govuk-grid-row">
                                <div className="govuk-grid-column-two-thirds">
                                    {/* Breadcrumbs removed as requested */}
                                    <span className="govuk-caption-xl">Step {currentStep} of 13</span>
                                    <h1 className="govuk-heading-xl">Apply for funeral expenses payment</h1>

                                    {hasErrors && (
                                        <div className="govuk-error-summary" aria-labelledby="error-summary-title" role="alert" data-module="govuk-error-summary">
                                            <h2 className="govuk-error-summary__title" id="error-summary-title">
                                                There is a problem
                                            </h2>
                                            <div className="govuk-error-summary__body">
                                                <ul className="govuk-list govuk-error-summary__list">
                                                    {Object.entries(errors).map(([field, error]) => (
                                                        <li key={field}>
                                                            <a href={`#${field}`}>{error}</a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )}

                                    <form>
                                        {/* Dynamically render the correct section based on formSections */}
                                        {renderSection()}

                                        <div className="govuk-button-group">
                                            {currentStep < 13 && (
                                                <button
                                                    type="button"
                                                    className="govuk-button"
                                                    onClick={handleNext}
                                                    disabled={loading}
                                                >
                                                    {searchParams.get('returnTo') === 'review' ? 'Save and return to summary' : 'Save and continue'}
                                                </button>
                                            )}

                                            {currentStep === 13 && (
                                                <button
                                                    type="button"
                                                    className="govuk-button"
                                                    onClick={handleSubmit}
                                                    disabled={loading}
                                                >
                                                    {loading ? "Saving..." : "Continue to review"}
                                                </button>
                                            )}

                                            {(currentStep > 1 || searchParams.get('returnTo') === 'review') && (
                                                <button
                                                    type="button"
                                                    className="govuk-button govuk-button--secondary"
                                                    onClick={handlePrevious}
                                                    disabled={loading}
                                                >
                                                    {searchParams.get('returnTo') === 'review' ? 'Back to summary' : 'Previous'}
                                                </button>
                                            )}
                                        </div>
                                    </form>

                                    {/* Bottom links for navigation and sign out */}
                                    <div className="dashboard-bottom-links" style={{ marginTop: 40, display: 'flex', alignItems: 'center' }}>
                                        <Link to="/dashboard" className="govuk-link govuk-!-margin-right-4">
                                            Return to dashboard
                                        </Link>
                                        <a
                                            href="/"
                                            className="govuk-link dashboard-signout-link"
                                            style={{ marginLeft: 'auto' }}
                                            onClick={handleSignOut}
                                        >
                                            Sign out
                                        </a>
                                    </div>
                                </div> {/* end govuk-grid-column-two-thirds */}
                            </div> {/* end govuk-grid-row */}
                            {/* ChatbotWidget placed outside the grid to ensure it's visible */}
                            <ChatbotWidget />
                        </main>
                    </div>
                </>
            )}
        </>
    );
};

export default FormPage;
