# Defect Log for Funeral Expenses Payment Application

## Defects Identified from User Testing (July 15, 2025)

| ID | Description | Status | Fix Details |
|----|-------------|--------|------------|
| 1 | In MERN-App evidence is still first and then repeated step prior to submission at step 13. Need to remove step 13 and ensure all other steps and task summary reflect this. | Fixed | Removed the duplicate evidence-documentation section from formStructure.js that was appearing as step 13. |
| 2 | In MERN-App evidence page, evidence upload and status would work better if we processed one file at a time. UI shows all extracting in parallel then jumps to all completed. | Fixed | Modified FormPage.js to handle files sequentially - each file is uploaded, extracted, and processed one at a time with UI status updates after each step. |
| 3 | In MERN-App evidence page, on return to evidence page after initial upload it does not show evidence uploaded with ability to delete. | Fixed | Added getEvidenceList API function and functionality to load previously uploaded evidence when returning to the evidence page. |
| 4 | In MERN-App evidence, dates do not appear to be extracting from evidence and populating form. | Fixed | Added special handling for date fields in the FormPage.js to ensure extracted dates are properly mapped to form fields. |
| 5 | In MERN-App evidence page, conditional sections do not appear to work on many pages (asks for details of partner, children etc before we answer yes or no to having one). Need to add conditional elements. | Fixed | Added conditional field handling to FormPage.js by importing and using the getConditionalFields function, and added case-insensitive comparison for conditional field values. |
| 6 | In MERN-App evidence page, funeral cost not extracted from evidence and populated to form. | Fixed | Added special handling for funeral cost fields to properly extract and format cost values from uploaded evidence. |

## Working Notes
- Created defect log: July 15, 2025
- Starting fixes in priority order
- Fixed defects 1 and 2: July 15, 2025
- Fixed defects 3, 4, 5, and 6: July 15, 2025
