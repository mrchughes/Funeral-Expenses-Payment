const { ChatOpenAI } = require('@langchain/openai');
const { RunnableSequence } = require('langchain/schema/runnable');
const { PromptTemplate } = require('langchain/prompts');
const { StringOutputParser } = require('langchain/schema/output_parser');
require('dotenv').config();

class LangGraphProcessor {
    constructor(formSchemaLoader, contextManager, semanticMapper, dbClient) {
        this.formSchemaLoader = formSchemaLoader;
        this.contextManager = contextManager;
        this.semanticMapper = semanticMapper;
        this.dbClient = dbClient;
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0,
            openAIApiKey: process.env.OPENAI_API_KEY
        });
        this.langGraph = this.setupLangGraph();
    }

    /**
     * Set up the LangGraph processing workflow
     * @returns {RunnableSequence} - The LangGraph workflow
     */
    setupLangGraph() {
        // Document classification node
        const classifierPrompt = PromptTemplate.fromTemplate(`
      You are a document classification expert. Analyze the OCR text and determine the document type.
      
      # OCR Text (excerpt):
      {{ocrText}}
      
      # Possible Document Types:
      - Death Certificate
      - Funeral Invoice
      - Bank Statement
      - Benefit Award Letter
      - Relationship Proof
      - Identity Document
      
      Analyze the text content, formatting, and key phrases to determine the document type.
      
      # Response Format
      Return only the document type as a single string.
    `);

        const classifierChain = RunnableSequence.from([
            classifierPrompt,
            this.llm,
            new StringOutputParser()
        ]);

        // Form field selection node
        const fieldSelectorPrompt = PromptTemplate.fromTemplate(`
      Based on the identified document type, determine which form fields are most likely to be found in this document.
      
      # Document Type:
      {{documentType}}
      
      # Available Form Fields:
      {{formFields}}
      
      # Response Format
      Return a JSON array of field IDs that are likely to be found in this document:
      ["field1", "field2", "field3"]
    `);

        const fieldSelectorChain = RunnableSequence.from([
            fieldSelectorPrompt,
            this.llm,
            new StringOutputParser()
        ]);

        // Entity extraction node
        const entityExtractorPrompt = PromptTemplate.fromTemplate(`
      Extract entities from the OCR text based on the document type and relevant fields.
      
      # Document Type:
      {{documentType}}
      
      # Relevant Fields:
      {{relevantFields}}
      
      # OCR Text:
      {{ocrText}}
      
      # User Context:
      {{userContext}}
      
      # Response Format
      Return a JSON object with the extracted entities:
      {
        "entities": [
          {
            "type": "field_type",
            "value": "extracted_value",
            "confidence": 0.95,
            "sourceText": "surrounding text"
          }
        ]
      }
    `);

        const entityExtractorChain = RunnableSequence.from([
            entityExtractorPrompt,
            this.llm,
            new StringOutputParser()
        ]);

        // Field mapping node
        const fieldMapperPrompt = PromptTemplate.fromTemplate(`
      Map the extracted entities to the form fields.
      
      # Extracted Entities:
      {{entities}}
      
      # Form Fields:
      {{formFields}}
      
      # User Context:
      {{userContext}}
      
      # Response Format
      Return a JSON object mapping field IDs to values:
      {
        "fieldId1": {
          "value": "extracted_value",
          "confidence": 0.95,
          "sourceText": "surrounding text"
        },
        "fieldId2": {
          "value": "extracted_value",
          "confidence": 0.8,
          "sourceText": "surrounding text"
        }
      }
    `);

        const fieldMapperChain = RunnableSequence.from([
            fieldMapperPrompt,
            this.llm,
            new StringOutputParser()
        ]);

        // Combine the chains into a sequential workflow
        const documentProcessingChain = RunnableSequence.from([
            {
                ocrText: (input) => truncateText(input.ocrText, 8000)
            },
            {
                documentType: classifierChain,
                ocrText: (input) => input.ocrText,
                formId: (input) => input.formId,
                userId: (input) => input.userId
            },
            {
                documentType: (input) => input.documentType,
                formFields: async (input) => {
                    const fields = await this.formSchemaLoader.loadFormFields(input.formId);
                    return JSON.stringify(fields.map(f => ({ id: f.id, name: f.name, description: f.description })));
                },
                ocrText: (input) => input.ocrText,
                userId: (input) => input.userId
            },
            {
                documentType: (input) => input.documentType,
                relevantFields: async (input) => {
                    const fieldIds = await fieldSelectorChain.invoke({
                        documentType: input.documentType,
                        formFields: input.formFields
                    });
                    return fieldIds;
                },
                ocrText: (input) => input.ocrText,
                userContext: async (input) => {
                    const context = await this.contextManager.getUserContext(input.userId);
                    return this.contextManager.formatContextForPrompt(context);
                },
                formId: (input) => input.formId,
                userId: (input) => input.userId
            },
            {
                entities: async (input) => {
                    const entities = await entityExtractorChain.invoke({
                        documentType: input.documentType,
                        relevantFields: input.relevantFields,
                        ocrText: input.ocrText,
                        userContext: input.userContext
                    });
                    return entities;
                },
                formFields: (input) => input.formFields,
                userContext: (input) => input.userContext,
                documentType: (input) => input.documentType,
                formId: (input) => input.formId,
                userId: (input) => input.userId,
                ocrText: (input) => input.ocrText
            },
            {
                mappedFields: async (input) => {
                    const mappedFields = await fieldMapperChain.invoke({
                        entities: input.entities,
                        formFields: input.formFields,
                        userContext: input.userContext
                    });
                    return mappedFields;
                },
                documentType: (input) => input.documentType,
                formId: (input) => input.formId,
                userId: (input) => input.userId
            }
        ]);

        return documentProcessingChain;
    }

    /**
     * Process a document through the LangGraph workflow
     * @param {string} documentId - The document ID
     * @param {string} formId - The form ID
     * @param {string} userId - The user ID
     * @param {string} ocrText - The OCR text
     * @returns {Promise<Object>} - The processing result
     */
    async processDocument(documentId, formId, userId, ocrText) {
        try {
            console.log(`[LangGraph] Processing document ${documentId} for form ${formId}, user ${userId}`);

            // Update document state
            await this.dbClient.updateDocumentState(
                documentId,
                'semantic_mapping',
                'Starting semantic field mapping',
                50
            );

            // Run the LangGraph workflow
            const result = await this.langGraph.invoke({
                documentId,
                formId,
                userId,
                ocrText
            });

            // Parse the mapped fields
            let mappedFields;
            try {
                mappedFields = JSON.parse(result.mappedFields);
            } catch (parseError) {
                console.error(`Error parsing mapped fields:`, parseError);
                console.log(`Raw mapped fields:`, result.mappedFields);
                throw new Error(`Failed to parse mapped fields: ${parseError.message}`);
            }

            // Format the result for database storage
            const formattedResult = {
                extractedFields: Object.entries(mappedFields).map(([fieldId, data]) => ({
                    fieldId,
                    ...data
                }))
            };

            // Save the mapped fields to the database
            await this.dbClient.saveMappedFields(documentId, formId, formattedResult);

            // Update document state
            await this.dbClient.updateDocumentState(
                documentId,
                'fields_mapped',
                'Semantic field mapping completed',
                100
            );

            return {
                documentId,
                documentType: result.documentType,
                mappedFields: formattedResult,
            };
        } catch (error) {
            console.error(`[LangGraph] Error processing document:`, error);

            // Update document state on error
            await this.dbClient.updateDocumentState(
                documentId,
                'error',
                `Semantic mapping error: ${error.message}`,
                0
            );

            throw error;
        }
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

module.exports = LangGraphProcessor;
