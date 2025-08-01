// Date format utility functions for evidence processing

/**
 * Takes a date string in various formats and attempts to convert it to a standard format (DD/MM/YYYY)
 * This handles:
 * - Written dates with ordinals (e.g., "17th September nineteen seventy")
 * - Various numeric formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
 * - Spelled out months and years
 * - Common abbreviations
 * 
 * @param {string} dateString The date string to parse
 * @returns {string|null} The formatted date string (DD/MM/YYYY) or null if parsing fails
 */
export function standardizeDate(dateString) {
    if (!dateString) return null;

    // Make a copy of the original to return if all else fails
    const originalString = dateString;
    dateString = dateString.trim();

    // Handle empty or obviously invalid inputs
    if (!dateString || dateString === 'Not provided' || dateString === 'Not found') {
        return null;
    }

    try {
        // Remove common OCR artifacts
        dateString = dateString
            .replace(/[\[\](){}<>]/g, '') // Remove brackets
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();

        // Try to parse as ISO date first (YYYY-MM-DD)
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateString)) {
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                return formatDateDDMMYYYY(date);
            }
        }

        // Check for common date formats with slash or dot separators (DD/MM/YYYY or MM/DD/YYYY)
        const dateMatches = dateString.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
        if (dateMatches) {
            // Try both DD/MM/YYYY and MM/DD/YYYY interpretations
            const [_, part1, part2, part3] = dateMatches;

            // Assume DD/MM/YYYY format first (common in UK)
            let day = parseInt(part1, 10);
            let month = parseInt(part2, 10) - 1; // JS months are 0-indexed
            let year = parseInt(part3, 10);

            // Fix 2-digit years
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }

            // Validate date
            const date1 = new Date(year, month, day);
            if (!isNaN(date1.getTime()) &&
                date1.getDate() === day &&
                date1.getMonth() === month &&
                date1.getFullYear() === year) {
                return formatDateDDMMYYYY(date1);
            }

            // Try MM/DD/YYYY format if DD/MM/YYYY failed
            day = parseInt(part2, 10);
            month = parseInt(part1, 10) - 1; // JS months are 0-indexed

            const date2 = new Date(year, month, day);
            if (!isNaN(date2.getTime()) &&
                date2.getDate() === day &&
                date2.getMonth() === month &&
                date2.getFullYear() === year) {
                return formatDateDDMMYYYY(date2);
            }
        }

        // Handle written date formats like "17th September nineteen seventy"
        // First, normalize the string
        let normalizedDateString = dateString.toLowerCase()
            .replace(/(\d+)(st|nd|rd|th)/, '$1') // Remove ordinal suffixes
            .replace(/\b(nineteenth|nineteenth century|twentieth|twentieth century)\b/g, '') // Remove century references
            .replace(/\bof\b/g, ''); // Remove "of" as in "17th of September"

        // Convert written numbers to digits
        const numberWords = {
            'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
            'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11,
            'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
            'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
            'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
            'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000
        };

        // Replace spelled out numbers with digits
        for (const [word, digit] of Object.entries(numberWords)) {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            normalizedDateString = normalizedDateString.replace(regex, digit.toString());
        }

        // Handle special year cases like "nineteen seventy" -> "1970"
        normalizedDateString = normalizedDateString
            // Match patterns like "nineteen seventy" -> "1970"
            .replace(/\b(19|nineteen)\s*(\d\d|[a-z]+)\b/gi, (match, century, year) => {
                const centuryNum = century === 'nineteen' ? '19' : century;
                // Convert word year to number if needed
                let yearNum = year;
                if (isNaN(parseInt(year, 10))) {
                    for (const [word, digit] of Object.entries(numberWords)) {
                        if (word === year.toLowerCase()) {
                            yearNum = digit;
                            break;
                        }
                    }
                }
                return centuryNum + yearNum;
            })
            // Match patterns like "twenty ten" -> "2010"
            .replace(/\b(20|twenty)\s*(\d\d|[a-z]+)\b/gi, (match, century, year) => {
                const centuryNum = century === 'twenty' ? '20' : century;
                // Convert word year to number if needed
                let yearNum = year;
                if (isNaN(parseInt(year, 10))) {
                    for (const [word, digit] of Object.entries(numberWords)) {
                        if (word === year.toLowerCase()) {
                            yearNum = digit;
                            break;
                        }
                    }
                }
                return centuryNum + yearNum;
            });

        // Month name mapping
        const months = {
            'january': 0, 'jan': 0,
            'february': 1, 'feb': 1,
            'march': 2, 'mar': 2,
            'april': 3, 'apr': 3,
            'may': 4,
            'june': 5, 'jun': 5,
            'july': 6, 'jul': 6,
            'august': 7, 'aug': 7,
            'september': 8, 'sept': 8, 'sep': 8,
            'october': 9, 'oct': 9,
            'november': 10, 'nov': 10,
            'december': 11, 'dec': 11
        };

        // Look for pattern: Day Month Year (e.g., "17 September 1970")
        const writtenDateRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{2,4})\b/;
        const writtenMatch = normalizedDateString.match(writtenDateRegex);

        if (writtenMatch) {
            const day = parseInt(writtenMatch[1], 10);
            const monthName = writtenMatch[2].toLowerCase();
            let year = parseInt(writtenMatch[3], 10);

            // Fix 2-digit years
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }

            // Check if month name is valid
            if (months[monthName] !== undefined) {
                const month = months[monthName];
                const date = new Date(year, month, day);

                if (!isNaN(date.getTime())) {
                    return formatDateDDMMYYYY(date);
                }
            }
        }

        // Look for pattern: Month Day Year (e.g., "September 17 1970" or "September 17, 1970")
        const altWrittenDateRegex = /\b([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{2,4})\b/;
        const altWrittenMatch = normalizedDateString.match(altWrittenDateRegex);

        if (altWrittenMatch) {
            const monthName = altWrittenMatch[1].toLowerCase();
            const day = parseInt(altWrittenMatch[2], 10);
            let year = parseInt(altWrittenMatch[3], 10);

            // Fix 2-digit years
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }

            // Check if month name is valid
            if (months[monthName] !== undefined) {
                const month = months[monthName];
                const date = new Date(year, month, day);

                if (!isNaN(date.getTime())) {
                    return formatDateDDMMYYYY(date);
                }
            }
        }

        // As a last resort, try the Date.parse function with the normalized string
        const parsedDate = new Date(normalizedDateString);
        if (!isNaN(parsedDate.getTime())) {
            return formatDateDDMMYYYY(parsedDate);
        }

        // If we got this far, return the original
        console.warn(`Could not parse date: ${dateString}`);
        return originalString;
    } catch (error) {
        console.error(`Error parsing date "${dateString}":`, error);
        return originalString;
    }
}

/**
 * Formats a Date object as DD/MM/YYYY
 */
function formatDateDDMMYYYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Standardizes addresses by removing common OCR errors and normalizing format
 * @param {string} address The address string to normalize
 * @returns {string} The normalized address string
 */
export function standardizeAddress(address) {
    if (!address) return address;

    // Remove common OCR artifacts and normalize spacing
    let cleanAddress = address
        .replace(/[\[\](){}<>]/g, '') // Remove brackets
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

    // Handle multi-line addresses
    cleanAddress = cleanAddress.replace(/\n+/g, ', ');

    // Remove duplicate commas and normalize spacing around commas
    cleanAddress = cleanAddress.replace(/,\s*,+/g, ',').replace(/,\s*/g, ', ');

    // Normalize UK postcodes (e.g., "M1 1AA" instead of "M11AA")
    cleanAddress = cleanAddress.replace(/\b([A-Z]{1,2}\d[A-Z\d]?)(\s*)(\d[A-Z]{2})\b/gi,
        (match, outward, space, inward) => `${outward} ${inward}`);

    return cleanAddress;
}

/**
 * Applies data standardization to evidence fields
 * @param {Object} evidence The evidence data object from the API
 * @returns {Object} The standardized evidence data
 */
export function standardizeEvidenceData(evidence) {
    if (!evidence) return evidence;

    // Create a copy to avoid modifying the original
    const standardized = JSON.parse(JSON.stringify(evidence));

    // Process each file's extracted data
    for (const filename in standardized) {
        try {
            let fileData = standardized[filename];

            // Skip if it's an error message (string)
            if (typeof fileData === 'string' && fileData.startsWith('Error')) {
                continue;
            }

            // Parse the JSON string if necessary
            if (typeof fileData === 'string') {
                try {
                    fileData = JSON.parse(fileData);
                    standardized[filename] = fileData;
                } catch (error) {
                    console.error(`Failed to parse evidence data for ${filename}:`, error);
                    continue;
                }
            }

            // Process date fields
            const dateFields = [
                'dateOfBirth', 'partnerDateOfBirth', 'deceasedDateOfBirth', 'deceasedDateOfDeath',
                'responsibilityDate', 'benefitLetterDate', 'funeralDateIssued'
            ];

            dateFields.forEach(field => {
                if (fileData[field] && fileData[field].value) {
                    const standardDate = standardizeDate(fileData[field].value);
                    if (standardDate) {
                        fileData[field].value = standardDate;
                    }
                }
            });

            // Process address fields
            const addressFields = [
                'addressLine1', 'addressLine2', 'deceasedAddressLine1', 'deceasedAddressLine2'
            ];

            addressFields.forEach(field => {
                if (fileData[field] && fileData[field].value) {
                    fileData[field].value = standardizeAddress(fileData[field].value);
                }
            });

            // Handle full address fields that might contain multiple lines
            if (fileData.address && fileData.address.value) {
                fileData.address.value = standardizeAddress(fileData.address.value);
            }

            standardized[filename] = fileData;
        } catch (error) {
            console.error(`Error standardizing evidence data for ${filename}:`, error);
        }
    }

    return standardized;
}
