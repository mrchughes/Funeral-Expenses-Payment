from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import sys
import logging
from datetime import datetime
import time
import json
import gc
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.tools.tavily_search import TavilySearchResults
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
from typing import Optional, List

# Set up logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("app.log")
    ]
)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app, 
     origins=["*"],
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"])

# Get API keys
openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    logging.error("No OpenAI API key found")
else:
    logging.info("OpenAI API key loaded successfully")

tavily_key = os.getenv("TAVILY_API_KEY")
if tavily_key:
    logging.info("Tavily API key loaded successfully")
else:
    logging.warning("No Tavily API key found, web search will be unavailable")

# Global variables
script_dir = os.path.dirname(os.path.abspath(__file__))
persist_dir = os.path.join(script_dir, 'ai_agent/chroma_db')
rag_db = None  # Global RAG database variable
_agent_workflow = None  # Cached workflow to avoid recreation on every request

# Define the AgentState TypedDict
class AgentState(TypedDict):
    """State for the agent workflow"""
    input: str
    chat_history: Optional[List]
    selected_tool: Optional[str]
    intermediate_steps: List
    response: Optional[str]
    source: Optional[str]
    confidence: Optional[float]
    tool_failed: Optional[bool]

# Load the RAG database
def load_rag_database():
    global rag_db
    try:
        if os.path.exists(persist_dir):
            logging.info(f"Loading RAG database from {persist_dir}")
            
            # Initialize embeddings
            local_embeddings = OpenAIEmbeddings(openai_api_key=openai_key)
            rag_db = Chroma(persist_directory=persist_dir, embedding_function=local_embeddings)
            
            # Verify DB has documents
            db_data = rag_db.get()
            if db_data and 'documents' in db_data:
                doc_count = len(db_data['documents'])
                logging.info(f"Successfully loaded RAG database with {doc_count} chunks")
            else:
                logging.warning("RAG database exists but contains no documents")
            
            return True
        else:
            logging.warning(f"No RAG database found at {persist_dir}")
            return False
    except Exception as e:
        logging.error(f"Error loading RAG database: {e}", exc_info=True)
        return False

# Source router function
def source_router(state: AgentState) -> AgentState:
    """
    LLM-based router that decides which knowledge source to use.
    Updates state["selected_tool"] with "rag_tool", "direct_llm_tool", or "web_search_tool"
    """
    query = state["input"]
    chat_history = state.get("chat_history", [])
    
    logging.info(f"[ROUTER] Determining best source for: '{query}'")
    
    try:
        # Use LLM to analyze and route based on query content
        router_prompt = """
        You are an intelligent router for a question answering system focused on the UK's Department for Work and Pensions (DWP) 
        and specifically the Funeral Expenses Payment (FEP) scheme.
        
        Analyze this query and determine the best knowledge source to answer it.
        
        Query: {query}
        
        Recent conversation history:
        {history}
        
        Choose ONE of the following sources:
        - rag: If this is about DWP or FEP policy, procedures, eligibility, benefits, forms, applications, requirements, or any specific details about the funeral expenses payment scheme.
        - direct_llm: If this is general knowledge, math, simple definitions, or topics clearly unrelated to FEP/DWP.
        - web_search: If this requires current information, news, statistics, or specific external data not likely in policy documents.
        
        Return ONLY one of these exact source names: "rag", "direct_llm", or "web_search" without any explanation.
        """
        
        # Format chat history for context
        formatted_history = ""
        if chat_history and len(chat_history) > 0:
            recent_history = chat_history[-3:] if len(chat_history) > 3 else chat_history
            for msg in recent_history:
                role = msg.get("role", "")
                content = msg.get("content", "")
                formatted_history += f"{role}: {content}\n"
        
        # Use a small, fast model for routing
        router_llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0, openai_api_key=openai_key)
        response = router_llm.invoke([{
            "role": "system",
            "content": router_prompt.format(query=query, history=formatted_history)
        }])
        
        # Extract just the source name and normalize
        source = response.content.strip().lower()
        logging.info(f"[ROUTER] Router suggested source: {source}")
        
        # Map to valid tool name and set default
        if source == "rag":
            state["selected_tool"] = "rag_tool"
        elif source == "web_search":
            state["selected_tool"] = "web_search_tool"
        elif source == "direct_llm":
            state["selected_tool"] = "direct_llm_tool"
        else:
            # Default to direct_llm if response is malformed
            logging.warning(f"[ROUTER] Unexpected router response: {source}, defaulting to direct_llm")
            state["selected_tool"] = "direct_llm_tool"
        
    except Exception as e:
        logging.error(f"[ROUTER] Error in source router: {e}", exc_info=True)
        # Default to direct_llm on error
        state["selected_tool"] = "direct_llm_tool"
    
    logging.info(f"[ROUTER] Selected tool: {state['selected_tool']}")
    return state

# Tool implementation for RAG source
def use_rag_source(state: AgentState) -> AgentState:
    """Use RAG to generate a response"""
    global rag_db
    
    query = state["input"]
    conversation_history = state.get("chat_history", [])
    
    logging.info(f"[RAG_TOOL] Attempting RAG for query: '{query}'")
    
    if rag_db is None:
        load_rag_database()
    
    if rag_db is None:
        logging.error("[RAG_TOOL] RAG database not loaded, cannot create response")
        state["tool_failed"] = True
        return state
    
    try:
        # Initialize LLM for response generation
        llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
        
        # Enhance the search query to improve RAG retrieval
        # For FEP questions, add additional context to improve document retrieval
        enhanced_query = query
        
        # Check if this is a question about FEP policy
        is_fep_query = any(keyword in query.lower() for keyword in ["funeral", "expenses", "payment", "fep"])
        
        if is_fep_query:
            # Add specific FEP-related terms to enhance the query
            enhanced_query = f"{query} funeral expenses payment policy dwp eligibility"
            logging.info(f"[RAG_TOOL] Enhanced FEP query: {enhanced_query}")
        
        # If we have conversation history, include recent questions in the search query
        search_query = enhanced_query
        if conversation_history:
            # Get up to 3 most recent user messages to enhance the context
            recent_queries = []
            for message in reversed(conversation_history):
                if message["role"] == "user" and len(recent_queries) < 3:
                    recent_queries.append(message["content"])
            
            if recent_queries:
                # Combine the current query with recent queries for better context
                search_query = f"{enhanced_query} {' '.join(recent_queries)}"
                logging.info(f"[RAG_TOOL] Enhanced search query with conversation history: {search_query}")
        
        try:
            # Try with similarity_search_with_score first
            relevant_docs = rag_db.similarity_search_with_score(search_query, k=10)
            
            # Log the retrieved documents and their scores for debugging
            logging.info(f"[RAG_TOOL] Retrieved {len(relevant_docs)} documents from RAG")
            for i, (doc, score) in enumerate(relevant_docs[:3]):  # Log just the first few docs
                source = doc.metadata.get('source_doc', 'Unknown')
                logging.info(f"[RAG_TOOL] Doc {i+1}: Score={score}, Source={source}")
            
            # Filter docs by relevance score (lower is better in OpenAI embeddings)
            # Use a more lenient threshold to include more potentially relevant documents
            threshold = 0.5  # Much more lenient threshold to ensure we get some results
            filtered_docs = [doc for doc, score in relevant_docs if score < threshold]
            
            if not filtered_docs and relevant_docs:
                # If no docs passed the threshold but we have results, take the top 3
                logging.info(f"[RAG_TOOL] No docs under threshold {threshold}, using top 3 docs instead")
                filtered_docs = [doc for doc, _ in relevant_docs[:3]]
                
        except Exception as search_error:
            logging.error(f"[RAG_TOOL] Error with similarity_search_with_score: {search_error}")
            # Fallback to regular similarity search without scores
            try:
                filtered_docs = rag_db.similarity_search(search_query, k=5)
                logging.info(f"[RAG_TOOL] Used fallback similarity_search, found {len(filtered_docs)} docs")
            except Exception as fallback_error:
                logging.error(f"[RAG_TOOL] Fallback search also failed: {fallback_error}")
                filtered_docs = []
        
        if not filtered_docs:
            logging.info(f"[RAG_TOOL] No relevant documents found in RAG database")
            state["tool_failed"] = True
            return state
        
        # Format the context from the documents
        context = "\n\n".join([f"Document: {doc.metadata.get('source_doc', 'Unknown')}\n{doc.page_content}" for doc in filtered_docs])
        
        # Format messages for the chat model
        messages = []
        
        # Add system prompt with context - stronger instructions to use the RAG context
        messages.append({
            "role": "system", 
            "content": f"""You are a helpful assistant for DWP (Department for Work and Pensions) specializing in Funeral Expenses Payment policy.
Use ONLY the following information from policy documents to answer the user's question:

{context}

CRITICAL INSTRUCTIONS:
1. Base your answer EXCLUSIVELY on the information provided above.
2. If the exact answer isn't in the provided information, say: "I don't have specific information on that in my policy documents."
3. DO NOT use your general knowledge about funeral payments or DWP policies.
4. Cite specific parts of the provided information when answering.
5. Be concise and direct in your answers.
6. Maintain a compassionate tone as you're likely helping someone who has been bereaved.
"""
        })
        
        # Add conversation history if available
        if conversation_history:
            # Add only the most recent conversation turns (limit to 10 for context window)
            recent_history = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history
            messages.extend(recent_history)
        
        # Add current query if not already included
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": query})
        
        logging.info(f"[RAG_TOOL] Using RAG with {len(messages)} message history")
        
        response = llm.invoke(messages)
        
        # Update state with response
        state["response"] = response.content
        state["source"] = "rag"
        state["confidence"] = 0.9  # High confidence for RAG responses
        state["tool_failed"] = False
        
        logging.info(f"[RAG_TOOL] Successfully created RAG response")
        return state
        
    except Exception as e:
        logging.error(f"[RAG_TOOL] Error creating RAG response: {e}", exc_info=True)
        state["tool_failed"] = True
        return state

# Tool implementation for direct LLM
def use_direct_llm_tool(state: AgentState) -> AgentState:
    """Use direct LLM to generate a response"""
    query = state["input"]
    conversation_history = state.get("chat_history", [])
    
    logging.info(f"[DIRECT_LLM] Generating direct response for query: '{query}'")
    
    try:
        # Initialize LLM
        llm = ChatOpenAI(temperature=0.3, openai_api_key=openai_key)
        
        # Format messages for the LLM
        messages = []
        
        # Add system prompt
        messages.append({
            "role": "system", 
            "content": """You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy.

Your role:
1. Answer general knowledge questions accurately and concisely.
2. For any questions about Funeral Expenses Payment policy, state when you're providing general information rather than specific policy details.
3. Maintain a compassionate tone as you may be speaking with someone who has been bereaved.
4. For complex calculations or specific numbers, clearly show your reasoning.
5. If asked about current events or very recent information, acknowledge that your knowledge may not be current.

Always be helpful, accurate, and compassionate.
"""
        })
        
        # Add conversation history if available
        if conversation_history:
            # Add only the most recent conversation turns
            recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
            messages.extend(recent_history)
        
        # Add current query if not already included
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": query})
        
        logging.info(f"[DIRECT_LLM] Using direct LLM with {len(messages)} message history")
        
        response = llm.invoke(messages)
        
        # Update state with response
        state["response"] = response.content
        state["source"] = "direct_llm"
        state["confidence"] = 0.8  # Medium confidence for general knowledge
        state["tool_failed"] = False
        
        logging.info("[DIRECT_LLM] Successfully generated direct response")
        return state
        
    except Exception as e:
        logging.error(f"[DIRECT_LLM] Error generating direct response: {e}", exc_info=True)
        state["tool_failed"] = True
        return state

# Tool implementation for web search
def use_web_search_tool(state: AgentState) -> AgentState:
    """Use web search to generate a response"""
    query = state["input"]
    conversation_history = state.get("chat_history", [])
    
    logging.info(f"[WEB_SEARCH] Attempting web search for query: '{query}'")
    
    try:
        # Initialize chat model
        chat_model = ChatOpenAI(temperature=0.2, openai_api_key=openai_key)
        
        # Initialize web search
        if not tavily_key:
            logging.error("[WEB_SEARCH] No Tavily API key available for web search")
            state["tool_failed"] = True
            return state
            
        web_search = TavilySearchResults(api_key=tavily_key, max_results=3)
        
        # Perform web search
        search_results = web_search.invoke(query)
        
        if not search_results:
            logging.info("[WEB_SEARCH] No web search results found")
            state["tool_failed"] = True
            return state
        
        # Format search results for better context
        def format_result(result):
            source = result.get('source') or result.get('url') or result.get('title') or 'Unknown Source'
            content = result.get('content') or result.get('snippet') or result.get('text') or ''
            title = result.get('title', '')
            return {
                "source": source,
                "content": content,
                "title": title
            }
        
        formatted_results = [format_result(r) for r in search_results]
        
        # Extract titles/headlines if available
        titles = [r["title"] for r in formatted_results if r["title"]]
        titles_text = "\n".join([f"- {title}" for title in titles]) if titles else "No specific titles found."
        
        # Full context for LLM
        context = "\n\n".join([f"Source: {r['source']}\nTitle: {r['title']}\n{r['content']}" for r in formatted_results])

        # Format messages for the chat model
        messages = []
        
        # Add system prompt with context
        messages.append({
            "role": "system", 
            "content": f"""You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy.
Use the following information from web search to answer the user's question:

{context}

Titles/Headlines found:
{titles_text}

Instructions:
1. Always assume questions are about FEP or DWP context unless clearly stated otherwise.
2. Present information in a clear, organized format - use bullet points for lists of items.
3. If the search results contain relevant information but not exactly what was asked, provide a helpful summary of what IS available.
4. Only say there is no information if the results are completely irrelevant.
5. For FEP policy queries, focus on official DWP information and eligibility criteria.
6. Be conversational, compassionate, and helpful in your response since you're likely speaking with someone who has been bereaved.
7. Maintain conversation context with previous messages.
8. Keep answers concise and focused on helping claimants understand FEP eligibility and process.
9. Clearly indicate that information comes from web searches.
"""
        })
        
        # Add conversation history if available
        if conversation_history:
            # Add only the most recent conversation turns (limit to keep context window manageable)
            recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
            messages.extend(recent_history)
        
        # Add current query if not already included
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": query})
        
        logging.info(f"[WEB_SEARCH] Using web search with {len(messages)} message history")
        
        response = chat_model.invoke(messages)
        
        # Update state with response
        state["response"] = response.content
        state["source"] = "web"
        state["confidence"] = 0.7  # Lower confidence for web search
        state["tool_failed"] = False
        
        logging.info("[WEB_SEARCH] Successfully generated web search response")
        return state
        
    except Exception as e:
        logging.error(f"[WEB_SEARCH] Error generating web search response: {e}", exc_info=True)
        state["tool_failed"] = True
        return state

# Create a response based on the selected tool's output
def generate_final_response(state: AgentState) -> AgentState:
    """Create the final response based on tool outputs"""
    # If a tool has already generated a response, we're done
    if "response" in state and state.get("tool_failed", True) is False:
        logging.info(f"[FINAL] Using response from source: {state.get('source', 'unknown')}")
        return state
    
    # If the selected tool failed, try fallback options
    if state.get("tool_failed", False):
        logging.info(f"[FINAL] Selected tool {state.get('selected_tool', 'unknown')} failed, trying fallbacks")
        
        # Define fallback order: RAG -> Direct LLM -> Web Search -> Default message
        fallbacks = ["rag_tool", "direct_llm_tool", "web_search_tool"]
        original_tool = state.get("selected_tool", "unknown")
        
        # Skip the original tool in fallbacks
        try:
            fallbacks.remove(original_tool)
        except ValueError:
            pass
        
        # Try each fallback in order
        for fallback_tool in fallbacks:
            logging.info(f"[FINAL] Trying fallback: {fallback_tool}")
            
            # Make a copy of state to avoid affecting the original
            fallback_state = state.copy()
            fallback_state["selected_tool"] = fallback_tool
            fallback_state["tool_failed"] = False  # Reset failure flag
            
            # Execute fallback tool
            if fallback_tool == "rag_tool":
                fallback_state = use_rag_source(fallback_state)
            elif fallback_tool == "direct_llm_tool":
                fallback_state = use_direct_llm_tool(fallback_state)
            elif fallback_tool == "web_search_tool":
                fallback_state = use_web_search_tool(fallback_state)
                
            # If fallback succeeded, use its response
            if not fallback_state.get("tool_failed", True) and "response" in fallback_state:
                logging.info(f"[FINAL] Using fallback {fallback_tool} response")
                # Copy successful fallback response to original state
                state["response"] = fallback_state["response"]
                state["source"] = f"{fallback_tool} (fallback from {original_tool})"
                state["tool_failed"] = False
                return state
    
    # If all tools failed, provide a default response
    if state.get("tool_failed", True) or "response" not in state:
        logging.warning("[FINAL] All tools failed, using default response")
        state["response"] = "I'm sorry, I'm having trouble generating a response at the moment. Please try rephrasing your question or try again later."
        state["source"] = "default_fallback"
        state["tool_failed"] = False
    
    return state

# Create the LangGraph workflow
def create_agent_workflow():
    """Create and return a LangGraph workflow for intelligent source selection"""
    try:
        # Initialize the workflow
        workflow = StateGraph(AgentState)
        
        # Add nodes to the workflow
        workflow.add_node("source_router", source_router)
        workflow.add_node("use_rag", use_rag_source)
        workflow.add_node("use_direct_llm", use_direct_llm_tool)
        workflow.add_node("use_web_search", use_web_search_tool)
        workflow.add_node("generate_final_response", generate_final_response)
        
        # Define the edges (connections between nodes)
        # First, route from the router to the appropriate tool based on the selected_tool
        workflow.add_conditional_edges(
            "source_router",
            lambda state: state.get("selected_tool", "direct_llm_tool"),
            {
                "rag_tool": "use_rag",
                "direct_llm_tool": "use_direct_llm",
                "web_search_tool": "use_web_search"
            }
        )
        
        # Connect all tools to final response generator
        workflow.add_edge("use_rag", "generate_final_response")
        workflow.add_edge("use_direct_llm", "generate_final_response")
        workflow.add_edge("use_web_search", "generate_final_response")
        
        # Set final response as the end node
        workflow.add_edge("generate_final_response", END)
        
        # Set the entry point
        workflow.set_entry_point("source_router")
        
        # Compile the workflow
        return workflow.compile()
    except Exception as e:
        logging.error(f"[WORKFLOW] Error creating agent workflow: {e}", exc_info=True)
        return None

# Get or create the agent workflow
def get_agent_workflow():
    """Get or create the agent workflow"""
    global _agent_workflow
    if _agent_workflow is None:
        _agent_workflow = create_agent_workflow()
    return _agent_workflow

# Load RAG database on startup
load_rag_database()

# Define basic routes
@app.route('/ai-agent/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200

@app.route('/ai-agent/chat', methods=['POST'])
def chat():
    """Unified chat endpoint that uses the agent workflow to intelligently choose knowledge sources"""
    try:
        # Get input from request
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Invalid request, missing JSON body'
            }), 400
        
        # Handle different input field names for compatibility
        user_input = data.get('text') or data.get('input') or data.get('query')
        if not user_input:
            return jsonify({
                'success': False,
                'error': 'Invalid request, missing input text'
            }), 400
        
        # Get conversation history if available
        conversation_history = data.get('history', [])
        
        # Log the request
        history_len = len(conversation_history) if conversation_history else 0
        logging.info(f"[CHAT] Received query: '{user_input}' with {history_len} messages in conversation history")
        
        # Check if user explicitly requested web search
        web_search_requested = False
        if 'use_web_search' in data and data['use_web_search']:
            web_search_requested = True
            logging.info("[CHAT] Web search explicitly requested")
        
        # Initialize time tracking
        start_time = time.time()
        
        # Set up the initial state for the workflow
        initial_state = {
            "input": user_input,
            "chat_history": conversation_history,
            "intermediate_steps": [],
            "tool_failed": False
        }
        
        # If web search was explicitly requested, use web search directly
        if web_search_requested and tavily_key:
            logging.info("[CHAT] Web search explicitly requested")
            # Skip the router and go directly to web search
            state = {
                "input": user_input,
                "chat_history": conversation_history,
                "intermediate_steps": [],
                "selected_tool": "web_search_tool",
                "tool_failed": False
            }
            result = use_web_search_tool(state)
            
            if not result.get("tool_failed", True) and "response" in result:
                # Web search successful
                response_text = result.get("response", "")
                response_source = "web"
                sources = ["Web Search Results"]
                elapsed_time = time.time() - start_time
                
                logging.info(f"[CHAT] Generated web search response in {elapsed_time:.2f} seconds")
                response_preview = response_text[:100] + "..." if len(response_text) > 100 else response_text
                logging.info(f"[CHAT] Response preview: {response_preview}")
                
                return jsonify({
                    "success": True,
                    "response": response_text,
                    "source": response_source,
                    "sources": sources,
                    "processing_time": elapsed_time
                })
        
        try:
            # Get or create the workflow
            workflow = get_agent_workflow()
            if workflow is None:
                raise Exception("Failed to create agent workflow")
            
            # Run the workflow
            result = workflow.invoke(initial_state)
            
            # Extract response info from result
            response_text = result.get("response", "")
            response_source = result.get("source", "unknown")
            
            # Extract sources for attribution (for RAG and web search)
            sources = []
            if response_source.startswith("rag"):
                # For RAG, use a generic source for now
                sources = ["FEP Policy Documents"]
            elif response_source.startswith("web"):
                # For web search, use a generic source for now
                sources = ["Web Search Results"]
            
            # Check if all tools failed
            if response_source == "default_fallback":
                logging.warning("[CHAT] All tools failed, returning default response")
                
        except Exception as e:
            # If the workflow fails, use a simple fallback
            logging.error(f"[CHAT] Error running agent workflow: {e}", exc_info=True)
            response_text = "I'm sorry, I'm having trouble processing your question. Please try again later."
            response_source = "error"
            sources = []
        
        # Calculate and log response time
        elapsed_time = time.time() - start_time
        logging.info(f"[CHAT] Generated {response_source} response in {elapsed_time:.2f} seconds")
        
        # Log the first bit of the response for debugging
        response_preview = response_text[:100] + "..." if len(response_text) > 100 else response_text
        logging.info(f"[CHAT] Response preview: {response_preview}")
        
        # Return the response with a consistent format for all frontend apps
        return jsonify({
            "success": True,
            "response": response_text,
            "source": response_source,
            "sources": sources,
            "processing_time": elapsed_time
        })
        
    except Exception as e:
        logging.error(f"[CHAT] Unexpected error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)
