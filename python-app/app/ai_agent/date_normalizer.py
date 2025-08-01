import re
from datetime import datetime
import logging

class DateNormalizer:
    def __init__(self):
        # Define common date formats
        self.month_names = {
            'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
            'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 
            'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12
        }
        
        self.day_names = {
            'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5, 'sixth': 6, 
            'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10, 'eleventh': 11, 'twelfth': 12,
            'thirteenth': 13, 'fourteenth': 14, 'fifteenth': 15, 'sixteenth': 16, 'seventeenth': 17, 
            'eighteenth': 18, 'nineteenth': 19, 'twentieth': 20, 'twenty-first': 21, 
            'twenty-second': 22, 'twenty-third': 23, 'twenty-fourth': 24, 'twenty-fifth': 25, 
            'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28, 'twenty-ninth': 29, 
            'thirtieth': 30, 'thirty-first': 31,
            '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7, '8th': 8, '9th': 9,
            '10th': 10, '11th': 11, '12th': 12, '13th': 13, '14th': 14, '15th': 15, '16th': 16, '17th': 17,
            '18th': 18, '19th': 19, '20th': 20, '21st': 21, '22nd': 22, '23rd': 23, '24th': 24, '25th': 25,
            '26th': 26, '27th': 27, '28th': 28, '29th': 29, '30th': 30, '31st': 31
        }
        
    def normalize_date(self, date_string):
        """
        Convert various date formats to DD/MM/YYYY
        
        Args:
            date_string (str): Date string in various formats
            
        Returns:
            str: Normalized date in DD/MM/YYYY format or original if parsing fails
        """
        if not date_string:
            return ""
            
        try:
            # Clean the input
            date_string = date_string.strip().lower()
            
            # Direct format match attempt (common formats)
            try:
                # Try to parse using common formats
                for fmt in ('%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d %B %Y', '%d %b %Y', '%B %d, %Y', '%b %d, %Y'):
                    try:
                        dt = datetime.strptime(date_string, fmt)
                        return dt.strftime('%d/%m/%Y')
                    except ValueError:
                        continue
            except Exception:
                pass
            
            # Handle written-out dates like "Seventeenth June 2025"
            day_pattern = '|'.join(self.day_names.keys())
            month_pattern = '|'.join(self.month_names.keys())
            year_pattern = r'\d{4}'
            
            pattern = rf'({day_pattern})\s+({month_pattern})\s+({year_pattern})'
            match = re.search(pattern, date_string, re.IGNORECASE)
            
            if match:
                day_str, month_str, year = match.groups()
                day = self.day_names.get(day_str.lower())
                month = self.month_names.get(month_str.lower())
                
                if day and month and year:
                    return f"{day:02d}/{month:02d}/{year}"
            
            # If we reach here, try to extract numeric patterns
            date_patterns = [
                r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})',  # DD/MM/YYYY or DD-MM-YYYY
                r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})'     # YYYY/MM/DD or YYYY-MM-DD
            ]
            
            for pattern in date_patterns:
                match = re.search(pattern, date_string)
                if match:
                    parts = match.groups()
                    if len(parts[0]) == 4:  # YYYY-MM-DD format
                        year, month, day = parts
                    else:  # DD/MM/YYYY format
                        day, month, year = parts
                        
                    # Convert to integers
                    day = int(day)
                    month = int(month)
                    year = int(year)
                    
                    # Handle 2-digit years
                    if year < 100:
                        if year > 50:
                            year += 1900
                        else:
                            year += 2000
                            
                    return f"{day:02d}/{month:02d}/{year}"
            
            # Last attempt - find day, month and year separately
            day_match = re.search(r'(\d{1,2})(st|nd|rd|th)?', date_string)
            month_match = re.search(month_pattern, date_string, re.IGNORECASE)
            year_match = re.search(r'\b(19|20)\d{2}\b', date_string)
            
            if day_match and month_match and year_match:
                day = int(day_match.group(1))
                month = self.month_names.get(month_match.group(0).lower())
                year = int(year_match.group(0))
                
                return f"{day:02d}/{month:02d}/{year}"
                
            # Return original if parsing fails
            logging.warning(f"[DATE NORMALIZER] Could not normalize date: {date_string}")
            return date_string
            
        except Exception as e:
            logging.error(f"[DATE NORMALIZER] Error normalizing date: {e}", exc_info=True)
            return date_string
            
    def process_data_object(self, data):
        """
        Process a data object and normalize any date fields
        
        Args:
            data (dict): Extracted data with 'value' and 'reasoning' fields
            
        Returns:
            dict: Processed data with normalized dates
        """
        date_fields = [
            'dateOfBirth', 'dateOfDeath', 'deceasedDateOfBirth', 'deceasedDateOfDeath',
            'deceasedCertificateIssued', 'funeralDateIssued', 'benefitStartDate',
            'benefitEndDate', 'applicationDate', 'registrationDate'
        ]
        
        # Don't modify the original
        result = data.copy()
        
        for field, field_data in result.items():
            # Skip non-dict fields
            if not isinstance(field_data, dict):
                continue
                
            value = field_data.get('value', '')
            
            # Check if this is a date field either by name or by content
            is_date_field = any(date_key in field.lower() for date_key in ['date', 'birth', 'death', 'issued'])
            
            if is_date_field or any(date_key in field for date_key in date_fields):
                normalized = self.normalize_date(value)
                if normalized != value:
                    # Update the field with normalized date
                    field_data['value'] = normalized
                    field_data['original_value'] = value
                    field_data['reasoning'] += f" (Normalized from: {value})"
                    
        return result
