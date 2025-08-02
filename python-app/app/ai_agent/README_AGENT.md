# AI Agent Source Selection Enhancement

This update implements an intelligent agent-based approach for selecting the appropriate knowledge source when answering user queries. This approach makes the AI agent smarter about when to use RAG (retrieval augmented generation), direct LLM knowledge, or web search.

## New Features

1. **LLM-Based Source Router**: Intelligently decides which knowledge source is most appropriate for each query.
2. **Improved Tool Selection**: Now uses LangGraph workflow for intelligent source routing.
3. **Enhanced Error Handling**: Better fallback mechanisms when primary tools fail.
4. **Agent Mode**: New experimental mode accessible by adding `?use_agent=true` to the URL.

## Implementation Details

### Agent Workflow

The new implementation uses LangGraph to create a workflow that:

1. Routes the query to the appropriate source using an LLM decision.
2. Executes the selected tool (RAG, direct LLM, or web search).
3. Handles fallbacks gracefully if the primary tool fails.
4. Generates a final response with source attribution.

### New Endpoint

- `/ai-agent/agent-chat`: New endpoint that uses the agent-based workflow
- The existing `/ai-agent/chat` endpoint remains unchanged for backward compatibility

### How to Use

To try the new agent-based implementation, add `?use_agent=true` to the URL:

```
http://localhost:5000/?use_agent=true
```

When Agent Mode is active, you'll see an "Agent Mode Active" indicator in the bottom right corner of the screen.

## Benefits

1. **More Intelligent Source Selection**: Uses LLM to analyze queries rather than hardcoded rules.
2. **Better Error Handling**: Gracefully falls back to alternative sources when needed.
3. **No Disruption to Existing Features**: Implemented alongside the current functionality.
4. **Improved RAG Error Handling**: Better detection and handling of RAG failures.

## Future Improvements

1. Extract specific document sources from RAG results for better attribution.
2. Add the ability to explain source selection decisions.
3. Implement more sophisticated fallback mechanisms.
4. Extend the web search tool to provide better source attribution.
