const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('langchain/prompts');
const { LLMChain } = require('langchain/chains');
const { getEmbeddings, getTextSimilarity } = require('./embedding-service');
require('dotenv').config();

class SemanticMapper {
    constructor(formSchemaLoader, contextManager) {
        this.formSchemaLoader = formSchemaLoader;
        this.contextManager = contextManager;
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0,
            openAIApiKey: process.env.OPENAI_API_KEY
        });
        this.llmChain = this.setupLLMChain();
    }

    /**
     * Set up the LangChain prompt and chain
     * @returns {LLMChain} - The LLM chain
     */
    setupLLMChain() {
        const promptTemplate = PromptTemplate.fromTemplate(`
      You are a document analysis expert. Your task is to extract information from OCR-processed documents 
      and match it to form fields semantically.

      # Form Fields
      The following are the form fields that need to be filled from the document:
      {{formFields}}

      # User Context
      {{userContext}}

      # Document Information
      Document Type: {{documentType}}
      
      # OCR Text
      {{ocrText}}

      # Instructions
      1. For each form field, find the relevant information in the OCR text.
      2. Use the user context to help disambiguate information.
      3. For each field, provide:
         - The extracted value
         - Confidence score (0-100)
         - Source location (text snippet from the document)

      # Response Format
      Provide the results in this JSON format:
      {
        "extractedFields": [
          {
            "fieldId": "field-id",
            "value": "extracted value",
            "confidence": 85,
            "sourceText": "text from document",
            "notes": "any special notes about this extraction"
          }
        ]
      }
    `);

        return new LLMChain({
            prompt: promptTemplate,
            llm: this.llm,
            outputKey: "extractionResults"
        });
    }

    /**
     * Map OCR text to form fields using semantic understanding
     * @param {string} documentId - The document ID
     * @param {string} formId - The form ID
     * @param {string} userId - The user ID
     * @param {string} documentType - The document type
     * @param {string} ocrText - The OCR text
     * @returns {Promise<Object>} - The mapped form fields
     */
    async mapToFormFields(documentId, formId, userId, documentType, ocrText) {
        try {
            console.log(`[Semantic Mapper] Mapping document ${documentId} to form ${formId}`);

            // Load form fields and user context
            const [formFields, userContext] = await Promise.all([
                this.formSchemaLoader.loadFormFields(formId),
                this.contextManager.getUserContext(userId)
            ]);

            if (!formFields) {
                throw new Error(`Form fields not found for form: ${formId}`);
            }

            // Format form fields for the prompt
            const formFieldsForPrompt = formFields.map(field =>
                `- ID: ${field.id}\n  Name: ${field.name}\n  Description: ${field.description}\n  Type: ${field.type}\n`
            ).join('\n');

            // Format user context for the prompt
            const userContextForPrompt = this.contextManager.formatContextForPrompt(userContext);

            // Process with LLM
            const result = await this.llmChain.call({
                formFields: formFieldsForPrompt,
                userContext: userContextForPrompt,
                documentType: documentType,
                ocrText: truncateText(ocrText, 10000) // Truncate to avoid token limits
            });

            // Parse the LLM response
            let extractedData;
            try {
                const jsonMatch = result.extractionResults.match(/```json\n([\s\S]*?)\n```/) ||
                    result.extractionResults.match(/\{[\s\S]*\}/);

                const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : result.extractionResults;
                extractedData = JSON.parse(jsonStr);
            } catch (parseError) {
                console.error(`Error parsing LLM response:`, parseError);
                console.log(`Raw response:`, result.extractionResults);
                throw new Error(`Failed to parse LLM response: ${parseError.message}`);
            }

            // Enhance the results with semantic validation
            const enhancedResults = await this.enhanceResults(extractedData, formFields, ocrText);

            return enhancedResults;
        } catch (error) {
            console.error(`[Semantic Mapper] Error mapping document:`, error);
            throw error;
        }
    }

    /**
     * Enhance the LLM results with additional semantic validation
     * @param {Object} extractedData - The data extracted by the LLM
     * @param {Array} formFields - The form fields
     * @param {string} ocrText - The OCR text
     * @returns {Promise<Object>} - Enhanced results
     */
    async enhanceResults(extractedData, formFields, ocrText) {
        const enhancedData = {
            extractedFields: []
        };

        // Map of field IDs to field definitions
        const fieldMap = new Map(formFields.map(field => [field.id, field]));

        // For each extracted field, perform additional validation
        for (const extraction of extractedData.extractedFields) {
            const fieldDef = fieldMap.get(extraction.fieldId);

            if (!fieldDef) {
                console.warn(`Field ID not found: ${extraction.fieldId}`);
                enhancedData.extractedFields.push(extraction);
                continue;
            }

            // Apply type-specific validation and formatting
            const enhancedExtraction = await this.validateAndEnhanceField(
                extraction,
                fieldDef,
                ocrText
            );

            enhancedData.extractedFields.push(enhancedExtraction);
        }

        // Look for any missing required fields
        const extractedFieldIds = new Set(enhancedData.extractedFields.map(f => f.fieldId));
        const missingRequiredFields = formFields.filter(field =>
            field.required && !extractedFieldIds.has(field.id)
        );

        // Add missing required fields with null values
        for (const missingField of missingRequiredFields) {
            enhancedData.extractedFields.push({
                fieldId: missingField.id,
                value: null,
                confidence: 0,
                sourceText: "",
                notes: "Required field not found in document"
            });
        }

        return enhancedData;
    }

    /**
     * Validate and enhance a single extracted field
     * @param {Object} extraction - The extracted field data
     * @param {Object} fieldDef - The field definition
     * @param {string} ocrText - The OCR text
     * @returns {Promise<Object>} - Enhanced extraction
     */
    async validateAndEnhanceField(extraction, fieldDef, ocrText) {
        const enhanced = { ...extraction };

        // Calculate semantic similarity between the field definition and extraction
        if (extraction.sourceText) {
            const fieldDesc = `${fieldDef.name}: ${fieldDef.description}`;
            const similarityScore = await getTextSimilarity(fieldDesc, extraction.sourceText);

            // Adjust confidence based on semantic similarity
            enhanced.semanticSimilarity = similarityScore;

            // If the LLM's confidence and semantic similarity disagree significantly, note it
            if (Math.abs((similarityScore * 100) - extraction.confidence) > 30) {
                enhanced.notes = (enhanced.notes || "") +
                    ` Semantic similarity (${Math.round(similarityScore * 100)}%) differs from confidence score.`;
            }
        }

        // Apply type-specific validation
        switch (fieldDef.type) {
            case 'date':
                enhanced.value = this.validateAndFormatDate(enhanced.value);
                break;
            case 'number':
                enhanced.value = this.validateAndFormatNumber(enhanced.value);
                break;
            case 'boolean':
                enhanced.value = this.validateAndFormatBoolean(enhanced.value);
                break;
        }

        return enhanced;
    }

    /**
     * Validate and format a date value
     * @param {string} value - The date value
     * @returns {string} - Formatted date or null if invalid
     */
    validateAndFormatDate(value) {
        if (!value) return null;

        // Try to parse various date formats
        const dateFormats = [
            // UK format
            { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, fn: (m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` },
            // US format
            { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, fn: (m) => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` },
            // ISO format
            { regex: /(\d{4})-(\d{1,2})-(\d{1,2})/, fn: (m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` },
            // Written format (e.g., "10th January 2023")
            {
                regex: /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/, fn: (m) => {
                    const months = {
                        january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
                        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
                    };
                    const month = months[m[2].toLowerCase()];
                    return month ? `${m[3]}-${month}-${m[1].padStart(2, '0')}` : null;
                }
            }
        ];

        for (const format of dateFormats) {
            const match = value.match(format.regex);
            if (match) {
                const formattedDate = format.fn(match);
                if (formattedDate) {
                    // Validate the date is real
                    const date = new Date(formattedDate);
                    if (!isNaN(date.getTime())) {
                        return formattedDate;
                    }
                }
            }
        }

        return value; // Return original if can't parse
    }

    /**
     * Validate and format a number value
     * @param {string} value - The number value
     * @returns {number|null} - Parsed number or null if invalid
     */
    validateAndFormatNumber(value) {
        if (value === null || value === undefined || value === '') return null;

        // Remove currency symbols and commas
        const cleanValue = value.toString().replace(/[£$,]/g, '');

        // Try to parse as a number
        const parsed = parseFloat(cleanValue);

        return isNaN(parsed) ? null : parsed;
    }

    /**
     * Validate and format a boolean value
     * @param {string} value - The boolean value
     * @returns {boolean|null} - Parsed boolean or null if invalid
     */
    validateAndFormatBoolean(value) {
        if (value === null || value === undefined || value === '') return null;

        const strValue = value.toString().toLowerCase().trim();

        // True values
        if (['yes', 'true', 'y', '1', 'correct', 'confirmed'].includes(strValue)) {
            return true;
        }

        // False values
        if (['no', 'false', 'n', '0', 'incorrect', 'denied'].includes(strValue)) {
            return false;
        }

        return null; // Can't determine
    }
}

/**
 * Truncate text to a maximum length
 * @param {string} text - The text to truncate
 * @param {number} maxLength - The maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;

    return text.substring(0, maxLength) + `... [truncated, ${text.length - maxLength} characters omitted]`;
}

module.exports = SemanticMapper;
