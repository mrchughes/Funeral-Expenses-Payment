# Data Extraction Improvements Backlog

## Overview
This backlog tracks improvements to the document data extraction process in the Funeral Expenses Payment application.

## User Requirements
1. **Simplify Evidence Collection Interface**
   - Remove checkboxes and "Which documents can you provide?" prompt from evidence page

2. **Deceased Person Context**
   - Add field to capture deceased person's name at top of evidence page
   - Use this information to provide context for document analysis

3. **Enhanced Context-Aware Extraction**
   - Improve AI analysis to understand document context (e.g., death certificate details relate to deceased person)
   - Use deceased name and applicant name to help with contextual understanding
   - Implement entity recognition and relationship mapping

4. **Improve Data Matching**
   - Address low field population rate in current implementation
   - Enhance fuzzy matching for fields with similar content
   - Implement confidence scoring for extracted data

5. **User-Friendly Extraction Results**
   - Improve extraction results dialog to use plain English field names
   - Provide clearer indication of which form fields were populated

## Technical Requirements
- Implementation must be modular and reusable
- AI-driven process with no hard-coded rules
- Robust error handling and confidence metrics

## Progress Tracking

### Current Status: ANALYSIS

### Completed Items
- [x] Create branch for development
- [x] Create backlog file

### In Progress
- [ ] Analysis of current extraction implementation
- [ ] Plan technical approach for improvements

### To Do
- [ ] UI changes to remove checkboxes and add deceased name field
- [ ] Enhance AI agent to utilize context from deceased and applicant names
- [ ] Improve document type detection
- [ ] Implement better field mapping for extracted data
- [ ] Update extraction results dialog with plain English field names
- [ ] Add comprehensive testing
- [ ] Document changes and improvements

## Testing Notes
_Will be added during implementation_
