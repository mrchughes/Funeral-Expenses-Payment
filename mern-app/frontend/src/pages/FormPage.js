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
import { saveSectionCompletion, loadSectionCompletion, getSectionCompletion, canMarkSectionComplete } from '../utils/sectionCompletion';
import { validateSection } from '../utils/formValidation';
import ChatbotWidget from "../components/ChatbotWidget";
import EvidenceUpload from "../components/EvidenceUpload";
import { uploadEvidenceFile, deleteEvidenceFile, getEvidenceList } from "../api/evidence";
import wsFactory from "../utils/WebSocketFactory";

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
    // State for section completion status
    const [sectionCompletionStatus, setSectionCompletionStatus] = useState({});

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

                    {/* Deceased name field to help with context awareness */}
                    <div className="govuk-form-group">
                        <h3 className="govuk-heading-m">About the deceased person</h3>
                        <div className="govuk-form-group">
                            <label className="govuk-label" htmlFor="deceasedFirstName">
                                Deceased person's first name
                            </label>
                            <input
                                className="govuk-input govuk-input--width-20"
                                id="deceasedFirstName"
                                name="deceasedFirstName"
                                type="text"
                                value={formData.deceasedFirstName || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="govuk-form-group">
                            <label className="govuk-label" htmlFor="deceasedLastName">
                                Deceased person's last name
                            </label>
                            <input
                                className="govuk-input govuk-input--width-20"
                                id="deceasedLastName"
                                name="deceasedLastName"
                                type="text"
                                value={formData.deceasedLastName || ''}
                                onChange={handleChange}
                            />
                        </div>

                        <h3 className="govuk-heading-m">About the applicant</h3>
                        <div className="govuk-form-group">
                            <label className="govuk-label" htmlFor="firstName">
                                Your first name
                            </label>
                            <input
                                className="govuk-input govuk-input--width-20"
                                id="firstName"
                                name="firstName"
                                type="text"
                                value={formData.firstName || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="govuk-form-group">
                            <label className="govuk-label" htmlFor="lastName">
                                Your last name
                            </label>
                            <input
                                className="govuk-input govuk-input--width-20"
                                id="lastName"
                                name="lastName"
                                type="text"
                                value={formData.lastName || ''}
                                onChange={handleChange}
                            />
                        </div>

                        <p className="govuk-body">Adding names above will help our AI more accurately extract information from your documents.</p>
                    </div>
                    <EvidenceUpload
                        onUpload={handleEvidenceUpload}
                        onDelete={handleEvidenceDelete}
                        evidenceList={uploadedEvidence}
                        uploadStatus={uploadStatus}
                    />
                    {console.log('[DEBUG] FormPage rendering - evidence states:', {
                        uploadStatus,
                        evidenceUploading,
                        processingFiles,
                        currentStep,
                        sectionId: formSections[currentStep - 1]?.id,
                        evidenceSectionEntered,
                        uploadStatusCount: Object.keys(uploadStatus).length,
                        uploadedEvidenceCount: uploadedEvidence.length
                    })}
                    {/* Extremely strict conditions for showing processing message:
                        1. Must be actively uploading (evidenceUploading true)
                        2. Must have at least one file in uploadStatus
                        3. processingFiles must be true to indicate active processing
                        4. Evidence section must have been properly entered */}
                    {evidenceUploading &&
                        Object.keys(uploadStatus).length > 0 &&
                        processingFiles &&
                        evidenceSectionEntered && (
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

                    {/* Section completion checkbox for evidence section */}
                    <div className="govuk-form-group govuk-!-margin-top-6 govuk-!-margin-bottom-6">
                        <div className="govuk-checkboxes">
                            <div className="govuk-checkboxes__item">
                                <input
                                    className="govuk-checkboxes__input"
                                    id="sectionComplete"
                                    name="sectionComplete"
                                    type="checkbox"
                                    checked={sectionCompletionStatus[section.id] || false}
                                    onChange={handleChange}
                                />
                                <label className="govuk-label govuk-checkboxes__label govuk-!-font-weight-bold" htmlFor="sectionComplete">
                                    Mark this section as complete
                                </label>
                            </div>
                        </div>
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

                {/* Section completion checkbox */}
                <div className="govuk-form-group govuk-!-margin-top-6 govuk-!-margin-bottom-6">
                    <div className="govuk-checkboxes">
                        <div className="govuk-checkboxes__item">
                            <input
                                className="govuk-checkboxes__input"
                                id="sectionComplete"
                                name="sectionComplete"
                                type="checkbox"
                                checked={sectionCompletionStatus[section.id] || false}
                                onChange={handleChange}
                            />
                            <label className="govuk-label govuk-checkboxes__label govuk-!-font-weight-bold" htmlFor="sectionComplete">
                                Mark this section as complete
                            </label>
                        </div>
                    </div>
                    <div className="govuk-hint govuk-!-margin-top-2">
                        You must fill in all required fields before marking this section as complete
                    </div>
                </div>
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
    const [evidenceSectionEntered, setEvidenceSectionEntered] = useState(false); // Track if evidence section has been entered
    // Initial state values - will be updated in useEffect
    // (moved to top)
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // --- All useEffect and useCallback hooks next ---
    // Handle WebSocket document status updates
    const handleDocumentStatusUpdate = useCallback((documentId, update) => {
        console.log(`[FormPage] Received document status update for ${documentId}:`, update);

        // Extract the status info from the update message - handle different formats
        let status, progress, step;

        // Handle different WebSocket message formats
        if (update.type === 'processing_started') {
            status = 'processing';
            progress = update.data?.progress || 0;
            step = update.data?.step || 'Starting';
        } else if (update.type === 'progress_updated') {
            status = update.data?.state || 'processing';
            progress = update.data?.progress || 50;
            step = update.data?.step || status;
        } else if (update.type === 'processing_completed') {
            status = 'completed';
            progress = 100;
            step = 'Complete';
        } else if (update.type === 'error_occurred') {
            status = 'error';
            progress = 0;
            step = update.data?.step || 'Error';
        } else if (update.type === 'state_changed') {
            status = update.data?.state || 'processing';
            progress = update.data?.progress || 50;
            step = update.data?.step || status;
        } else {
            // Handle legacy formats (direct status object)
            status = update.status || (update.data && update.data.status) || 'processing';
            progress = update.progress || (update.data && update.data.progress) || 0;
            step = update.step || (update.data && update.data.step) || status;
        }

        console.log(`[FormPage] Processing status update: ${status} (${progress}%) - ${step}`);

        // CRITICAL CHECK: If this is marked as an existing file update, always set it to complete
        if (update.isExistingFile === true) {
            console.log(`[FormPage] Received update for EXISTING file - forcing to 'complete' status`);

            // Find the matching file
            const matchingFile = uploadedEvidence.find(file =>
                file.documentId === documentId ||
                (file.url && file.url.includes(documentId))
            );

            if (matchingFile) {
                // For already uploaded files, ALWAYS ensure they show as complete
                setUploadStatus(prevStatus => {
                    const newStatus = { ...prevStatus };
                    newStatus[matchingFile.name] = {
                        progress: 100,
                        state: 'processed',
                        step: 'Complete'
                    };
                    return newStatus;
                });
            }
            return; // Stop processing - don't update anything else
        }

        // Update the upload status state
        setUploadStatus(prevStatus => {
            // Find the file in our uploadedEvidence array that matches this documentId
            const matchingFile = uploadedEvidence.find(file =>
                file.documentId === documentId ||
                (file.url && file.url.includes(documentId))
            );

            if (!matchingFile) {
                console.log(`[FormPage] No matching file found for document ${documentId}`);
                return prevStatus;
            }

            const fileName = matchingFile.name;
            console.log(`[FormPage] Updating status for file ${fileName}`);

            // Secondary check: If processingFiles is false, it means we're not actively uploading
            if (!processingFiles) {
                console.log(`[FormPage] Ignoring status update for ${fileName} - no active uploads in progress`);

                // For already uploaded files that are "done", always ensure their status shows as complete
                const newStatus = { ...prevStatus };
                newStatus[fileName] = {
                    progress: 100,
                    state: 'processed',
                    step: 'Complete'
                };
                return newStatus;
            }

            const newStatus = { ...prevStatus };

            // Map processing states to UI states
            if (status === 'processing' || status === 'ocr_processing' ||
                status === 'classifying' || status === 'extracting' ||
                status === 'mapping') {
                newStatus[fileName] = {
                    progress: progress,
                    state: 'extracting',
                    step: step
                };
            } else if (status === 'completed' || status === 'extracted' ||
                status === 'ocr_completed' || status === 'classified') {
                newStatus[fileName] = {
                    progress: 100,
                    state: 'processed',
                    step: 'Complete'
                };
            } else if (status === 'error' || status === 'failed') {
                newStatus[fileName] = {
                    progress: 0,
                    state: 'extraction-failed',
                    step: step,
                    error: update.data?.error || update.message || update.error || 'Unknown error'
                };
            }

            console.log(`[FormPage] New status for ${fileName}:`, newStatus[fileName]);
            return newStatus;
        });
    }, [uploadedEvidence]);

    // Make the handler available globally so the EvidenceUpload component can call it
    useEffect(() => {
        window.handleDocumentStatusUpdate = handleDocumentStatusUpdate;
        return () => {
            delete window.handleDocumentStatusUpdate;
        };
    }, [handleDocumentStatusUpdate]);

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

    // We now use intelligent mapping instead of a static mapping
    // This minimal mapping is kept for backward compatibility
    const aiToFormFieldMap = {
        // Core fields that need special handling
        "Name of deceased": "deceasedFirstName", // Will split into first/last below
        "Name of applicant": "firstName", // Will split into first/last below
        "Claimant": "firstName", // Will split into first/last below
        "Address": "addressLine1", // Will split if possible
        "Applicant": "firstName", // Will split into first/last below

        // Keep other fields for backward compatibility
        "Date": "responsibilityDate",
        "responsibilityDate": "responsibilityDate", // Direct field match
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
        // Start with a clean slate
        setEvidenceError("");
        setEvidenceWarning("");

        // Only NOW set the uploading and processing flags to true
        // These flags control when the processing UI appears
        console.log('[EVIDENCE] Setting evidenceUploading and processingFiles to TRUE - active upload starting');
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

            // Get document ID from the response or generate one from the URL
            const documentId = res.documentId || `doc-${Date.now()}`;
            console.log(`[EVIDENCE] Document ID for ${file.name}: ${documentId}`);

            // Set up WebSocket subscription for this document
            console.log(`[EVIDENCE] Setting up WebSocket subscription for document ${documentId}`);
            wsFactory.subscribeToDocument(documentId, (update) => {
                console.log(`[EVIDENCE] WebSocket update for ${documentId}:`, update);
                if (typeof window.handleDocumentStatusUpdate === 'function') {
                    window.handleDocumentStatusUpdate(documentId, update);
                }
            });

            // Update evidence list with URL and document ID
            setUploadedEvidence(prev =>
                prev.map(item =>
                    item.name === res.name
                        ? { ...item, url: res.url, documentId: documentId }
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

            // Create a comprehensive context object for intelligent mapping
            const contextData = {
                // Form metadata
                currentStep: currentStep,
                formSection: formSections[currentStep - 1]?.id || null,

                // Deceased information
                deceasedFirstName: formData.deceasedFirstName || null,
                deceasedLastName: formData.deceasedLastName || null,
                deceasedDateOfBirth: formData.deceasedDateOfBirth || null,
                deceasedDateOfDeath: formData.deceasedDateOfDeath || null,

                // Funeral information
                funeralDirector: formData.funeralDirector || null,
                funeralTotalEstimatedCost: formData.funeralTotalEstimatedCost || null,
                funeralDateIssued: formData.funeralDateIssued || null,

                // Benefit information
                benefitType: formData.benefitType || null,
                benefitReference: formData.benefitReference || null
            };

            // Add consolidated deceased name if available
            if (formData.deceasedFirstName || formData.deceasedLastName) {
                contextData.deceasedName = `${formData.deceasedFirstName || ''} ${formData.deceasedLastName || ''}`.trim();
                console.log(`[EVIDENCE] Adding deceased name context: ${contextData.deceasedName}`);
            }

            // Use the user's name from authentication context instead of form fields
            if (user && user.name) {
                contextData.applicantName = user.name.trim();
                contextData.applicantEmail = user.email;
                console.log(`[EVIDENCE] Adding applicant name from user account: ${contextData.applicantName}`);
            }
            // Fallback to form data if available (for backward compatibility)
            else if (formData.firstName || formData.lastName) {
                contextData.applicantName = `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
                console.log(`[EVIDENCE] Adding applicant name context from form (fallback): ${contextData.applicantName}`);
            }

            // Add relationship context if available - critical for intelligent mapping
            if (formData.relationshipToDeceased) {
                contextData.relationshipToDeceased = formData.relationshipToDeceased;
                console.log(`[EVIDENCE] Adding relationship context: ${contextData.relationshipToDeceased}`);
            }

            // Define a status callback to update the UI during extraction
            const extractionStatusCallback = (statusUpdate) => {
                console.log(`[EVIDENCE] Extraction status update for ${file.name}:`, statusUpdate);

                // Update our status tracker with the current state
                if (statusUpdate.status === 'processing' || statusUpdate.status === 'started') {
                    statusTracker[file.name] = {
                        progress: statusUpdate.progress || 100,
                        state: 'extracting',
                        step: statusUpdate.step || 'Processing'
                    };
                } else if (statusUpdate.status === 'completed') {
                    statusTracker[file.name] = {
                        progress: 100,
                        state: 'processed',
                        step: 'Complete',
                        processingTimeSeconds: statusUpdate.processingTimeSeconds
                    };
                } else if (statusUpdate.status === 'error') {
                    statusTracker[file.name] = {
                        progress: 0,
                        state: 'extraction-failed',
                        step: statusUpdate.step || 'Error',
                        error: statusUpdate.error
                    };
                }

                // Update React state with the current state
                setUploadStatus({ ...statusTracker });
            };

            // Call AI extraction with context and status callback
            console.log(`[EVIDENCE] Starting AI extraction with status tracking for ${file.name}`);
            let result;
            try {
                result = await extractFormData(user?.token, fileId, contextData, extractionStatusCallback);
                console.log(`[EVIDENCE] AI extraction result for ${file.name}:`, result);
            } catch (err) {
                console.error(`[EVIDENCE] AI extraction failed for ${file.name}:`, err);
                // Handle timeout or extraction error - create a simple document type result
                result = {
                    extracted: {
                        [fileId]: JSON.stringify({
                            _meta: {
                                processed_by: "frontend_fallback",
                                confidence: 0.6,
                                reasoning: "Fallback due to extraction timeout"
                            },
                            _documentType: {
                                value: file.name.toLowerCase().includes('death') ? "Death Certificate" :
                                    file.name.toLowerCase().includes('funeral') ? "Funeral Invoice" :
                                        file.name.toLowerCase().includes('benefit') ? "Benefit Letter" : "Other Document",
                                reasoning: "Determined through filename analysis after extraction timeout"
                            }
                        })
                    }
                };
                // Show warning but continue
                setEvidenceWarning(`Document processing took too long. The file was uploaded but detailed data extraction failed.`);
            }

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
            let hasEmptyMappedData = false;

            // First check the mappedData property which is used in newer response format
            if (result.extracted.mappedData !== undefined) {
                // Check if we have an empty mappedData object
                if (Object.keys(result.extracted.mappedData).length === 0) {
                    console.log(`[EVIDENCE] Found empty mappedData object in extraction results`);
                    hasEmptyMappedData = true;
                    // We'll still consider this "found" but with empty data
                    foundExtraction = true;
                } else {
                    console.log(`[EVIDENCE] Found extraction data in mappedData property`);
                    val = result.extracted.mappedData;
                    foundExtraction = true;
                }
            } else {
                // Fall back to legacy format checking
                for (const key of possibleKeys) {
                    if (result.extracted[key]) {
                        val = result.extracted[key];
                        console.log(`[EVIDENCE] Found extraction data with key: ${key}`);
                        foundExtraction = true;
                        break;
                    }
                }
            }

            // Check for successful API response with no extractable content
            if (result.extracted.status === "success" &&
                (!foundExtraction || hasEmptyMappedData)) {
                console.log(`[EVIDENCE] API returned success status but no extractable content for ${file.name}`);

                // Show dialog with minimal information plus metadata
                const metadata = {};
                if (result.extracted.confidence_score !== undefined) {
                    metadata.confidence_score = result.extracted.confidence_score;
                }
                if (result.extracted.context_used !== undefined) {
                    metadata.context_used = result.extracted.context_used;
                }

                setExtractedFields({
                    documentType: {
                        value: "Document Upload Successful",
                        reasoning: "The document was successfully uploaded and processed, but no relevant form fields could be extracted."
                    },
                    _metadata: {
                        value: JSON.stringify(metadata, null, 2),
                        reasoning: "Technical metadata about the extraction process"
                    }
                });
                setUpdatedFields([]);
                setShowUpdatedFieldsPopup(true);

                // Update status
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

                        // With intelligent mapping, we use the field names directly from the extraction
                        // since they should already be mapped to form field names
                        const mappedKey = k;
                        extractedFieldInfo[mappedKey] = { value: v.value, reasoning: v.reasoning };
                        extractedFieldNames.add(mappedKey);

                        // Handle document type received from backend
                        if (k === "_documentType") {
                            console.log(`[EVIDENCE] Document type received from backend: ${v.value}`);

                            // Store the document type directly in the form data without re-classification
                            merged._documentType = v.value;
                            changedFields.push("_documentType");

                            // Map the backend-provided document type to UI evidence type
                            const documentTypeMappings = {
                                // Use a mapping object for cleaner, more maintainable code
                                "Death Certificate": "deathCertificate",
                                "Funeral Invoice": "funeralInvoice",
                                "Benefit Letter": "benefitLetter"
                            };

                            // Get the mapped evidence type or use a default
                            const docType = v.value.trim();
                            const evidenceType = documentTypeMappings[docType] ||
                                (docType.toLowerCase().includes("death") ? "deathCertificate" :
                                    docType.toLowerCase().includes("funeral") ? "funeralInvoice" :
                                        docType.toLowerCase().includes("benefit") ? "benefitLetter" : "otherDocument");

                            merged.evidenceType = evidenceType;
                            changedFields.push("evidenceType");
                            console.log(`[EVIDENCE] Mapped to evidence type: ${evidenceType}`);
                        }

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

                // Just set a warning for any case where we reach here
                // Our earlier checks should have handled the successful but empty extraction cases
                setEvidenceWarning(`No relevant data could be extracted from ${file.name}. The file was uploaded successfully.`);

                // Update status
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

            // Use the extracted fields as is without re-classifying the document
            const enhancedExtractedFields = { ...extractedFieldInfo };

            // Check if we have information from the new response format
            if (result.extracted.status === "success" && result.extracted.confidence_score !== undefined) {
                console.log(`[EVIDENCE] Using confidence score from API response: ${result.extracted.confidence_score}`);
                // Add confidence score from the API response
                enhancedExtractedFields._meta = {
                    confidence_score: result.extracted.confidence_score,
                    context_used: result.extracted.context_used || false
                };
            }

            // Use the document type from the backend if available
            if (enhancedExtractedFields._documentType) {
                // If backend already provided a document type, use it directly
                console.log(`[EVIDENCE] Using backend-provided document type: ${enhancedExtractedFields._documentType.value}`);

                if (!enhancedExtractedFields.documentType) {
                    enhancedExtractedFields.documentType = {
                        value: enhancedExtractedFields._documentType.value,
                        reasoning: enhancedExtractedFields._documentType.reasoning || "From backend document classification"
                    };
                }
            } else if (!enhancedExtractedFields.documentType) {
                // If no document type is available, use a generic label
                console.log(`[EVIDENCE] No document type information available, using generic label`);
                enhancedExtractedFields.documentType = {
                    value: "Document",
                    reasoning: "Generic document type - no specific classification available"
                };
            }

            setExtractedFields(enhancedExtractedFields);
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

            // Log detailed information for debugging
            console.error(`[EVIDENCE] Error stack:`, err.stack);
            console.error(`[EVIDENCE] Error processing context:`, {
                fileName: file.name,
                // Use file.name as documentId isn't available here
                fileId: 'unknown',
                errorType: err.constructor.name,
                errorMessage: err.message
            });

            // Ask backend for document classification as recovery mechanism
            console.log('[EVIDENCE] Attempting recovery through backend classification');
            try {
                // Request document analysis from the backend without doing frontend classification
                const documentInfo = {
                    files: [fileId],
                    context: contextData
                };

                // Making a direct call to the AI agent adapter's document analysis endpoint
                fetch(`${process.env.REACT_APP_BACKEND_URL}/api/document/analyze`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${user?.token}`
                    },
                    body: JSON.stringify(documentInfo)
                })
                    .then(response => response.json())
                    .then(analysisResult => {
                        if (analysisResult && analysisResult[fileId] && analysisResult[fileId].document_type) {
                            const documentType = analysisResult[fileId].document_type;
                            console.log(`[EVIDENCE] Recovery: Backend classified document as ${documentType}`);

                            // Map the document type to evidence type
                            const documentTypeMappings = {
                                "Death Certificate": "deathCertificate",
                                "Funeral Invoice": "funeralInvoice",
                                "Benefit Letter": "benefitLetter"
                            };

                            const evidenceType = documentTypeMappings[documentType] || "otherDocument";

                            // Update form data
                            let merged = { ...formData };
                            merged._documentType = documentType;
                            merged.evidenceType = evidenceType;
                            setFormData(merged);

                            // Mark as warning instead of error
                            statusTracker[file.name] = { progress: 100, state: 'extraction-limited' };
                            setUploadStatus({ ...statusTracker });
                            setEvidenceWarning(`Limited processing of ${file.name}. The file was uploaded successfully as ${documentType.toLowerCase()}.`);
                            setEvidenceUploading(false);
                            setProcessingFiles(false);
                            return;
                        } else {
                            throw new Error('Failed to get document classification from backend');
                        }
                    })
                    .catch(recoveryErr => {
                        console.error('[EVIDENCE] Recovery attempt failed:', recoveryErr);
                        // Continue to regular error handling below
                    });
            } catch (recoveryErr) {
                console.error('[EVIDENCE] Recovery attempt setup failed:', recoveryErr);
            }

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

            // Add a final safety check - if we're still in extraction state after 5 minutes, force it to complete
            setTimeout(() => {
                setUploadStatus(prev => {
                    // Check if this file is still being processed
                    if (prev[file.name] && prev[file.name].state === 'extracting') {
                        console.warn(`[EVIDENCE] Safety timeout - forcing completion for ${file.name}`);
                        // Force to complete state
                        const updatedStatus = { ...prev };
                        updatedStatus[file.name] = {
                            progress: 100,
                            state: 'processed',
                            extractedCount: 0
                        };
                        return updatedStatus;
                    }
                    return prev;
                });
                setEvidenceUploading(false);
                setProcessingFiles(false);
            }, 300000); // 5 minute final safety net
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

        // IMMEDIATELY reset all states that might trigger the processing message
        // Do this outside the try/catch to ensure it happens regardless of API success
        console.log('[EVIDENCE] IMMEDIATE reset of all processing states before evidence list load');
        setEvidenceUploading(false);
        setProcessingFiles(false);
        setEvidenceError("");
        setEvidenceWarning("");

        try {
            console.log('[EVIDENCE] Loading evidence list...');

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

                    // Populate form data with user name from AuthContext if available
                    if (user && user.name) {
                        console.log('[FORM] Adding user name from authentication context:', user.name);
                        const nameParts = user.name.split(' ');
                        if (nameParts.length >= 2) {
                            loadedFormData.firstName = nameParts[0];
                            loadedFormData.lastName = nameParts.slice(1).join(' ');
                        } else {
                            loadedFormData.firstName = user.name;
                            loadedFormData.lastName = '';
                        }
                    }

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

                    // Populate form data with user name from AuthContext if available
                    if (user && user.name) {
                        console.log('[FORM] Adding user name from authentication context (localStorage fallback):', user.name);
                        const nameParts = user.name.split(' ');
                        if (nameParts.length >= 2) {
                            loadedFormData.firstName = nameParts[0];
                            loadedFormData.lastName = nameParts.slice(1).join(' ');
                        } else {
                            loadedFormData.firstName = user.name;
                            loadedFormData.lastName = '';
                        }
                    }
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

    // Load section completion status after data is loaded
    useEffect(() => {
        if (isLoadingData || !user?.email) return;

        // Load section completion status from localStorage
        const completionStatus = loadSectionCompletion(user.email, {});
        setSectionCompletionStatus(completionStatus);
        console.log('[FORM] Loaded section completion status:', completionStatus);
    }, [isLoadingData, user?.email]);

    // Save current step to localStorage whenever it changes (basic function only)
    useEffect(() => {
        saveFormStep(user?.email, currentStep);
    }, [currentStep, user?.email]);

    // Dedicated effect to handle evidence section entry/exit and state management
    useEffect(() => {
        const currentSection = formSections[currentStep - 1];
        const isEvidenceSection = currentSection && currentSection.id === 'evidence-documentation';

        // Track if we're entering the evidence section for the first time
        if (isEvidenceSection) {
            console.log('[EVIDENCE SECTION] Detected entry into evidence section');
            setEvidenceSectionEntered(true);

            // IMPORTANT: Force reset ALL evidence-related states on section entry
            console.log('[EVIDENCE SECTION] Forcibly resetting all evidence upload states');
            setEvidenceUploading(false);
            setProcessingFiles(false);
            setEvidenceError("");
            setEvidenceWarning("");

            // Don't clear uploadStatus here as it contains the status of already uploaded files
        } else {
            // When leaving the evidence section, reset ALL states
            console.log('[EVIDENCE SECTION] Detected exit from evidence section');
            setEvidenceUploading(false);
            setProcessingFiles(false);
            setEvidenceError("");
            setEvidenceWarning("");
            // We can safely clear uploadStatus when leaving the section
            setUploadStatus({});
        }
    }, [currentStep, formSections]);

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
            // Special handling for section completion checkbox
            if (name === 'sectionComplete') {
                handleSectionCompletionChange(checked);
                return;
            }

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

    // Handle section completion checkbox
    const handleSectionCompletionChange = (checked) => {
        const section = formSections[currentStep - 1];
        if (!section) return;

        // If trying to mark as complete, validate the section first
        if (checked) {
            // Validate the current section
            const sectionErrors = validateSection(formData, section);

            if (Object.keys(sectionErrors).length > 0) {
                // Show validation errors if there are any
                setErrors(prev => ({ ...prev, ...sectionErrors }));
                return; // Don't mark as complete if validation fails
            }
        }

        // If validation passed or user is unmarking the section, update the status
        const newStatus = { ...sectionCompletionStatus, [section.id]: checked };
        setSectionCompletionStatus(newStatus);

        // Save to persistence
        if (user?.email) {
            saveSectionCompletion(user.email, section.id, checked);
        }

        // Update the section/task list with the new status
        const sectionStatuses = getAllSectionStatuses(formData, formSections);
        // Update the statuses based on the checkbox rather than field population
        sectionStatuses[section.id] = checked ? 'completed' :
            sectionStatuses[section.id] === 'not-started' ? 'not-started' : 'in-progress';

        if (user?.email) {
            saveSectionProgress(user.email, sectionStatuses);
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

        // No need to validate here as validation happens when marking the section as complete
        setLoading(true);
        try {
            // Check if we came from the review page
            const returnTo = searchParams.get('returnTo');

            if (returnTo === 'review') {
                const saveResult = await autoSaveToDatabase();
                console.log('[FORM] Returning to review page after save attempt, result:', saveResult);
                navigate("/review");
            } else {
                // Try to save but continue even if it fails
                const saveResult = await autoSaveToDatabase();
                console.log('[FORM] Saving and returning to tasks page, result:', saveResult);
                // Always save the current step to localStorage
                saveFormStep(user?.email, currentStep);
                // Navigate to tasks page instead of the next page
                navigate("/tasks");
            }
        } catch (error) {
            console.error('[FORM] Error during form navigation:', error);
            // Log the error but still navigate to tasks page
            setErrors({ general: "An error occurred while saving, but you can continue." });
            // Navigate to tasks page
            navigate("/tasks");
        } finally {
            setLoading(false);
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
                        <div className="govuk-modal-overlay" style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 9998,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <div className="govuk-modal-dialog" style={{
                                position: 'relative',
                                backgroundColor: '#ffffff',
                                padding: '30px',
                                borderRadius: '5px',
                                boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
                                maxWidth: '700px',
                                width: '90%',
                                maxHeight: '80vh',
                                overflowY: 'auto',
                                zIndex: 9999
                            }}>
                                <div className="govuk-grid-row">
                                    <div className="govuk-grid-column-full">
                                        <h2 className="govuk-heading-m">Evidence Analysis Results</h2>

                                        <button
                                            onClick={() => setShowUpdatedFieldsPopup(false)}
                                            style={{
                                                position: 'absolute',
                                                top: '20px',
                                                right: '20px',
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                padding: '5px',
                                                fontSize: '24px',
                                                color: '#0b0c0c',
                                                width: '44px',
                                                height: '44px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            className="govuk-button--secondary"
                                            aria-label="Close document analysis results"
                                        >
                                            ×
                                        </button>

                                        {/* Document type detection */}
                                        <div className="govuk-panel govuk-panel--confirmation" style={{
                                            backgroundColor: '#f3f2f1',
                                            color: '#0b0c0c',
                                            textAlign: 'left',
                                            padding: '15px'
                                        }}>
                                            <h3 className="govuk-panel__title" style={{
                                                fontSize: '19px',
                                                marginBottom: '5px',
                                                color: '#0b0c0c'
                                            }}>
                                                Document Type Detected
                                            </h3>
                                            <div className="govuk-panel__body" style={{ fontSize: '16px' }}>
                                                {extractedFields && extractedFields.documentType ?
                                                    extractedFields.documentType.value :
                                                    'Evidence Document'}
                                            </div>
                                        </div>

                                        <div className="govuk-grid-row govuk-!-margin-top-5">
                                            {/* Extracted data */}
                                            <div className="govuk-grid-column-one-half">
                                                <h3 className="govuk-heading-s">Extracted Information</h3>
                                                <dl className="govuk-summary-list">
                                                    {extractedFields && Object.keys(extractedFields).length > 0 ? (
                                                        Object.entries(extractedFields)
                                                            .filter(([field]) => field !== 'documentType')
                                                            .map(([field, info]) => (
                                                                <div key={field} className="govuk-summary-list__row">
                                                                    <dt className="govuk-summary-list__key">{field}</dt>
                                                                    <dd className="govuk-summary-list__value">
                                                                        {info.value}
                                                                        <details className="govuk-details govuk-!-margin-top-1 govuk-!-margin-bottom-1">
                                                                            <summary className="govuk-details__summary">
                                                                                <span className="govuk-details__summary-text">
                                                                                    Analysis details
                                                                                </span>
                                                                            </summary>
                                                                            <div className="govuk-details__text">
                                                                                {info.reasoning}
                                                                            </div>
                                                                        </details>
                                                                    </dd>
                                                                </div>
                                                            ))
                                                    ) : (
                                                        <div className="govuk-summary-list__row">
                                                            <dt className="govuk-summary-list__key">No data extracted</dt>
                                                            <dd className="govuk-summary-list__value">The system couldn't extract relevant information from this document</dd>
                                                        </div>
                                                    )}
                                                </dl>
                                            </div>

                                            {/* Form fields updated */}
                                            <div className="govuk-grid-column-one-half">
                                                <h3 className="govuk-heading-s">Form Fields Updated</h3>
                                                {updatedFields.length > 0 ? (
                                                    <ul className="govuk-list govuk-list--bullet">
                                                        {updatedFields.map(field => (
                                                            <li key={field}>{field}</li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="govuk-body">No form fields were updated.</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="govuk-button-group govuk-!-margin-top-6">
                                            <button
                                                className="govuk-button"
                                                onClick={() => setShowUpdatedFieldsPopup(false)}
                                            >
                                                Continue
                                            </button>
                                        </div>
                                    </div>
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
                                                    {searchParams.get('returnTo') === 'review' ? 'Save and return to summary' : 'Save and return to tasks'}
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
