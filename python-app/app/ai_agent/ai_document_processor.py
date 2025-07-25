import os
import logging
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain.chains import RetrievalQA
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.runnables import Runnable, RunnableConfig
import document_processor

class AIDocumentProcessor:
    def __init__(self, model_name="gpt-3.5-turbo", embedding_model="all-MiniLM-L6-v2"):
        self.document_processor = document_processor.DocumentProcessor()
        logging.info(f"[AI-OCR] Initializing AI Document Processor with model: {model_name}")
        try:
            # Skip the embeddings initialization for now
            # Just create a basic text analyzer that doesn't need embeddings
            self.embeddings = None
            
            # Initialize LLM
            self.llm = ChatOpenAI(
                model_name=model_name,
                temperature=0.1,
            )
            logging.info(f"[AI-OCR] Successfully initialized LLM: {model_name}")
            
            # Text splitter for chunking documents
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200,
            )
            logging.info("[AI-OCR] Text splitter initialized")
        except Exception as e:
            logging.error(f"[AI-OCR] Error initializing AI Document Processor: {e}", exc_info=True)
            raise
    
    def _create_documents_from_text(self, text, metadata=None):
        """
        Create LangChain Document objects from text
        """
        if not metadata:
            metadata = {}
        # Split text into chunks
        texts = self.text_splitter.split_text(text)
        # Create Document objects
        documents = [Document(page_content=t, metadata=metadata) for t in texts]
        return documents
    
    def process_and_analyze_document(self, file_path, queries=None):
        """
        Process a document and run analysis with LLM
        """
        logging.info(f"[AI-OCR] Processing and analyzing document: {file_path}")
        # Process document to extract text
        result = self.document_processor.process_file(file_path)
        if not result.get("success", False):
            logging.error(f"[AI-OCR] Document processing failed: {result.get('error', 'Unknown error')}")
            return result
        
        logging.info(f"[AI-OCR] Document processed successfully, extracted {result['text_length']} characters")
        
        # Create documents from extracted text
        documents = self._create_documents_from_text(
            result["text"], 
            metadata=result["metadata"]
        )
        
        # Since we don't have embeddings, let's use a direct approach without vectorstore
        logging.info(f"[AI-OCR] Using direct approach without vectorstore")
        
        # Run default analysis if no specific queries
        if not queries:
            queries = [
                "What is the main subject of this document?",
                "Summarize this document in 3-5 bullet points.",
                "What are the key dates mentioned in this document?",
                "Extract any financial amounts or numbers from this document."
            ]
        
        # Run queries
        analysis_results = {}
        for query in queries:
            try:
                logging.info(f"[AI-OCR] Running query: {query}")
                # Direct LLM approach
                prompt = PromptTemplate.from_template(
                    """
                    You are an expert document analyzer.
                    
                    Document: {text}
                    
                    Answer the following question about the document:
                    {query}
                    """
                )
                
                chain = (
                    prompt 
                    | self.llm 
                    | StrOutputParser()
                )
                
                result_text = chain.invoke({
                    "text": result["text"],
                    "query": query
                })
                analysis_results[query] = result_text
            except Exception as e:
                logging.error(f"[AI-OCR] Error running query {query}: {e}", exc_info=True)
                analysis_results[query] = f"Error: {str(e)}"
                
        # Combine results
        result["analysis"] = analysis_results
        return result
    
    def extract_specific_information(self, file_path, extraction_template):
        """
        Extract specific structured information from a document using a template
        """
        logging.info(f"[AI-OCR] Extracting information from document: {file_path}")
        # Process document to extract text
        result = self.document_processor.process_file(file_path)
        if not result.get("success", False):
            logging.error(f"[AI-OCR] Document processing failed: {result.get('error', 'Unknown error')}")
            return result
            
        logging.info(f"[AI-OCR] Document processed successfully, extracted {result['text_length']} characters")
        
        # Create prompt template for extraction
        prompt = PromptTemplate.from_template(
            """
            You are an expert document analyzer. Extract the following information from the document text.
            If a piece of information is not present, return "Not found" for that field.
            Document text:
            {text}
            Information to extract:
            {extraction_template}
            Return the extracted information in JSON format with the requested fields.
            """
        )
        
        # Create extraction chain
        extraction_chain = (
            prompt 
            | self.llm 
            | StrOutputParser()
        )
        
        # Run extraction
        try:
            logging.info(f"[AI-OCR] Running extraction with template: {extraction_template[:100]}...")
            extraction_result = extraction_chain.invoke({
                "text": result["text"],
                "extraction_template": extraction_template
            })
            result["extracted_info"] = extraction_result
            logging.info(f"[AI-OCR] Successfully extracted information")
        except Exception as e:
            logging.error(f"[AI-OCR] Error extracting information: {e}", exc_info=True)
            result["extracted_info"] = {"error": str(e)}
            
        return result
        
    def analyze_text_directly(self, text, document_type="generic", fields_to_extract=None):
        """
        Extract specific information from text directly using LLM
        """
        logging.info(f"[AI-OCR] Analyzing text directly, document type: {document_type}")
        
        # Default fields to extract based on document type
        if not fields_to_extract:
            if document_type == "death_certificate":
                fields_to_extract = [
                    "full_name", "date_of_death", "place_of_death", 
                    "cause_of_death", "date_of_birth", "informant_name"
                ]
            elif document_type == "funeral_invoice":
                fields_to_extract = [
                    "invoice_number", "invoice_date", "total_amount",
                    "service_provider", "recipient_name"
                ]
            else:
                fields_to_extract = [
                    "main_subject", "key_dates", "financial_amounts", 
                    "names_mentioned", "addresses"
                ]
                
        # Build extraction template
        extraction_template = ", ".join(fields_to_extract)
        
        # Create prompt
        prompt = PromptTemplate.from_template(
            """
            You are an expert document analyzer. Extract the following information from the document text.
            If a piece of information is not present, return "Not found" for that field.
            
            Document text:
            {text}
            
            Document type: {document_type}
            
            Information to extract:
            {extraction_template}
            
            Return the extracted information in JSON format with the requested fields.
            """
        )
        
        # Create extraction chain with explicit parser
        extraction_chain = (
            prompt 
            | self.llm 
            | StrOutputParser()
        )
        
        # Run extraction
        try:
            logging.info(f"[AI-OCR] Running extraction with template: {extraction_template}")
            extraction_result = extraction_chain.invoke({
                "text": text,
                "extraction_template": extraction_template,
                "document_type": document_type
            })
            
            result = {
                "success": True,
                "document_type": document_type,
                "extracted_info": extraction_result,
                "text": text,
                "text_length": len(text)
            }
            logging.info(f"[AI-OCR] Successfully extracted information")
            return result
        except Exception as e:
            logging.error(f"[AI-OCR] Error extracting information: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
