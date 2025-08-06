import os
import pytesseract
import pdf2image
import io
from PIL import Image
import tempfile
from pypdf import PdfReader
import docx2txt
import re
import logging
import gc  # Garbage collector for memory management
import concurrent.futures  # For parallel processing
import threading
from functools import partial

# OCR Configuration
OCR_CONFIG = {
    'lang': 'eng', # Language setting - can be expanded for multiple languages
    'config': '--psm 3 --oem 1', # Using more robust PSM 3 (auto page segmentation) and OEM 1 (LSTM only)
    'dpi': 400 # Higher DPI for better quality
}

# Tesseract tuning parameters - updated for better results
custom_config = r'--oem 1 --psm 3 -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.;:?!@#$%^&*()-_+=<>[]{}|/\\ " -c textord_min_linesize=1.5'

def preprocess_image(image, image_path=None):
    """
    Preprocess the image to improve OCR accuracy
    """
    from PIL import ImageEnhance, ImageFilter
    
    try:
        # Check if it's a PNG file for special processing
        is_png = False
        if image_path:
            _, ext = os.path.splitext(image_path)
            is_png = ext.lower() == '.png'
        
        # Convert to grayscale
        if image.mode != 'L':
            image = image.convert('L')
        
        # Increase image DPI if it's too low
        dpi = getattr(image, 'info', {}).get('dpi', (72, 72))
        if isinstance(dpi, tuple) and len(dpi) >= 1 and dpi[0] < 300:
            logging.info(f"[OCR] Low DPI image detected: {dpi}. Enhancing...")
        
        # Additional preprocessing for PNG files (likely scanned documents)
        if is_png:
            logging.info(f"[OCR] Using enhanced preprocessing for PNG file")
            
            # Special processing for scanned documents - try multiple approaches
            processed_images = []
            
            # Approach 1: Binarization with adaptive thresholding
            try:
                img1 = image.copy()
                img1 = img1.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
                enhancer = ImageEnhance.Contrast(img1)
                img1 = enhancer.enhance(3.0)  # Higher contrast for scanned docs
                img1 = img1.filter(ImageFilter.SHARPEN)
                img1 = img1.filter(ImageFilter.MedianFilter(size=3))
                processed_images.append(img1)
            except Exception as e:
                logging.error(f"[OCR] Preprocessing approach 1 failed: {e}")
            
            # Approach 2: Less aggressive contrast enhancement
            try:
                img2 = image.copy()
                enhancer = ImageEnhance.Contrast(img2)
                img2 = enhancer.enhance(1.8)
                img2 = img2.filter(ImageFilter.SHARPEN)
                processed_images.append(img2)
            except Exception as e:
                logging.error(f"[OCR] Preprocessing approach 2 failed: {e}")
            
            # Approach 3: Simple sharpening
            try:
                img3 = image.copy()
                img3 = img3.filter(ImageFilter.SHARPEN)
                img3 = img3.filter(ImageFilter.SHARPEN)
                processed_images.append(img3)
            except Exception as e:
                logging.error(f"[OCR] Preprocessing approach 3 failed: {e}")
            
            # Return the first processed image, but we'll use all of them in extract_text_from_image
            if processed_images:
                logging.info(f"[OCR] Created {len(processed_images)} preprocessed versions for PNG")
                return processed_images[0]
        
        # Standard preprocessing for other image types
        # Binarize the image using adaptive thresholding
        image = image.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
        
        # Enhance contrast - this helps with scanned documents
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.5)  # Increased contrast for better OCR
        
        # Additional sharpening for text clarity
        image = image.filter(ImageFilter.SHARPEN)
        image = image.filter(ImageFilter.SHARPEN)  # Apply twice for better effect
        
        # Resize image if too small
        if image.width < 1200 or image.height < 1200:
            ratio = max(1200/image.width, 1200/image.height)
            new_size = (int(image.width * ratio), int(image.height * ratio))
            image = image.resize(new_size, Image.LANCZOS)
            logging.info(f"[OCR] Resized small image to {new_size[0]}x{new_size[1]} for better OCR")
        
        # Handle large images - downsample if over 4000 pixels in any dimension to prevent memory issues
        elif image.width > 4000 or image.height > 4000:
            scale_factor = min(4000 / image.width, 4000 / image.height)
            new_width = int(image.width * scale_factor)
            new_height = int(image.height * scale_factor)
            logging.info(f"[OCR] Downsampling large image from {image.width}x{image.height} to {new_width}x{new_height} to prevent memory issues")
            image = image.resize((new_width, new_height), Image.LANCZOS)
        
        # Apply additional noise reduction
        image = image.filter(ImageFilter.MedianFilter(size=3))
        
        logging.info(f"[OCR] Image preprocessing complete. New size: {image.width}x{image.height}")
        return image
    except Exception as e:
        logging.error(f"[OCR] Error in image preprocessing: {str(e)}", exc_info=True)
        return image  # Return original image if preprocessing fails

def process_image_segment(segment, segment_idx, ocr_config, cleanup=True):
    """
    Process a single image segment using OCR
    This function is designed to run in parallel
    """
    try:
        # Apply OCR with custom configuration
        text = pytesseract.image_to_string(segment, lang=ocr_config['lang'], config=custom_config)
        
        # Clean up memory if requested
        if cleanup:
            del segment
            # Force garbage collection
            gc.collect()
            
        return segment_idx, text
    except Exception as e:
        logging.error(f"[OCR] Error processing image segment {segment_idx}: {e}", exc_info=True)
        return segment_idx, ""

def extract_text_from_image(image_path):
    """
    Extract text from an image file using OCR
    For large images, splits into segments and processes in parallel
    """
    try:
        # Start with garbage collection to free memory
        gc.collect()
        
        logging.info(f"[OCR] Processing image file: {image_path}")
        image = Image.open(image_path)
        
        # Get image details for logging
        logging.info(f"[OCR] Image size: {image.size}, mode: {image.mode}, format: {image.format}")
        
        # Get the file extension
        _, ext = os.path.splitext(image_path)
        is_png = ext.lower() == '.png'
        
        # Preprocess the image for better OCR results
        processed_image = preprocess_image(image, image_path)
        
        # For large images, split into segments and process in parallel
        if processed_image.width > 2000 or processed_image.height > 2000:
            logging.info(f"[OCR] Large image detected ({processed_image.width}x{processed_image.height}). Processing in segments.")
            
            # Determine number of segments (2x2 grid for large images)
            segments = []
            segment_width = processed_image.width // 2
            segment_height = processed_image.height // 2
            
            # Create segments
            for y in range(0, processed_image.height, segment_height):
                for x in range(0, processed_image.width, segment_width):
                    # Define segment boundaries
                    right = min(x + segment_width, processed_image.width)
                    bottom = min(y + segment_height, processed_image.height)
                    
                    # Crop segment
                    segment = processed_image.crop((x, y, right, bottom))
                    segments.append(segment)
            
            # Process segments in parallel
            max_workers = min(os.cpu_count() or 2, 4)  # Limit to 4 threads max
            results = {}
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(process_image_segment, segment, i, OCR_CONFIG): i 
                          for i, segment in enumerate(segments)}
                
                for future in concurrent.futures.as_completed(futures):
                    segment_idx, text = future.result()
                    results[segment_idx] = text
            
            # Combine results
            all_texts = [text for _, text in sorted(results.items())]
            combined_text = "\n".join(all_texts)
            
            # Clean up
            del processed_image
            del segments
            gc.collect()
            
            return combined_text
        
        # For regular-sized images, process directly
        # Try multiple OCR configurations for better results
        configs = [
            custom_config,
            '--psm 4 --oem 1',  # Assume a single column of text with LSTM only
            '--psm 3 --oem 1',  # Fully automatic page segmentation with LSTM only
            '--psm 6 --oem 1',  # Assume a single uniform block of text with LSTM only
            '--psm 11 --oem 1', # Sparse text - no specific orientation or spacing
            '--psm 1 --oem 1',  # Auto page segmentation with OSD
            '--psm 4 --oem 3',  # Assume a single column of text with LSTM + legacy
            '--psm 3 --oem 3',  # Fully automatic page segmentation with LSTM + legacy
            '--psm 12 --oem 3'  # Sparse text with OSD with LSTM + legacy
        ]
        
        # For PNG files, add more specialized configs that work well with scanned documents
        if is_png:
            configs.extend([
                '--psm 4 --oem 1 -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.;:?!@#$%^&*()-_+=<>[]{}|/\\ "',  # Better for scanned text
                '--psm 6 --oem 1 -c textord_min_linesize=1.5',  # Better for letter-type documents
                '--psm 3 --oem 1 -l eng --dpi 300',  # Explicitly set higher DPI
                '--psm 1 --oem 1 -c textord_heavy_nr=1 -c textord_really_old_xheight=1',  # Better for low quality scans
            ])
        
        best_text = ""
        
        # Try the default config first
        try:
            default_text = pytesseract.image_to_string(processed_image, lang=OCR_CONFIG['lang'])
            if default_text:
                best_text = default_text
                all_texts.append(default_text)
                logging.info(f"[OCR] Default configuration extracted {len(default_text)} chars")
        except Exception as e:
            logging.warning(f"[OCR] Default extraction failed: {e}")
        
        # ALWAYS try alternative configurations regardless of default result
        # This helps ensure we get the best possible extraction
        for config in configs:
                try:
                    text = pytesseract.image_to_string(processed_image, lang=OCR_CONFIG['lang'], config=config)
                    logging.info(f"[OCR] Config {config[:10]}... extracted {len(text)} chars")
                    
                    # Store all extracted texts
                    if text:
                        all_texts.append(text)
                    
                    # Choose the configuration that extracts the most text
                    if len(text) > len(best_text):
                        best_text = text
                except Exception as inner_e:
                    logging.error(f"[OCR] Error with config {config}: {inner_e}")
                    continue
        
        # For PNG files, if best_text is too short, combine all extracted texts
        _, ext = os.path.splitext(image_path)
        if ext.lower() == '.png' and len(best_text.strip()) < 50 and all_texts:
            logging.info(f"[OCR] PNG file with limited text. Combining {len(all_texts)} extracted results")
            # Combine all extracted texts, removing duplicates
            combined_text = "\n\n".join(all_texts)
            # Clean and deduplicate lines
            lines = set()
            for line in combined_text.split("\n"):
                line = line.strip()
                if line and len(line) > 3:  # Only keep lines with meaningful content
                    lines.add(line)
            
            combined_text = "\n".join(lines)
            logging.info(f"[OCR] Combined {len(lines)} unique lines with {len(combined_text)} chars")
            
            if len(combined_text) > len(best_text):
                best_text = combined_text
        
        if not best_text:
            logging.warning(f"[OCR] No text extracted from image {image_path}")
            
        # Clean the extracted text
        best_text = clean_extracted_text(best_text)
        
        # For PNG files, try direct OCR as a last resort if still no text
        _, ext = os.path.splitext(image_path)
        if ext.lower() == '.png' and not best_text:
            try:
                logging.info(f"[OCR] Trying direct OCR without preprocessing for PNG file")
                direct_text = pytesseract.image_to_string(image, lang=OCR_CONFIG['lang'])
                if direct_text:
                    best_text = clean_extracted_text(direct_text)
                    logging.info(f"[OCR] Direct OCR extracted {len(best_text)} chars")
            except Exception as direct_err:
                logging.error(f"[OCR] Direct OCR failed: {direct_err}")
        
        # Log the result
        if len(best_text) > 0:
            logging.info(f"[OCR] Successfully processed file: {image_path}, text length: {len(best_text)}")
            logging.info(f"[OCR] Sample of extracted text: {best_text[:100]}...")
        else:
            logging.warning(f"[OCR] No usable text extracted from image: {image_path}")
            
        return best_text
    except Exception as e:
        logging.error(f"[OCR] Error extracting text from image: {e}", exc_info=True)
        return ""

def process_pdf_page(page_idx, page, use_ocr=False, pdf_path=None, images=None):
    """
    Process a single PDF page - either extract text directly or use OCR
    This function is designed to be run in parallel
    """
    try:
        if not use_ocr:
            # Extract text directly from PDF page
            page_text = page.extract_text()
            if page_text and len(page_text.strip()) > 50:
                return page_idx, page_text
            return page_idx, ""
        else:
            # Use OCR on the page image
            if images and page_idx < len(images):
                image = images[page_idx]
                # Preprocess the image
                processed_image = preprocess_image(image)
                # Apply OCR with custom configuration
                page_text = pytesseract.image_to_string(processed_image, lang=OCR_CONFIG['lang'], config=custom_config)
                # Free memory
                del processed_image
                gc.collect()
                return page_idx, page_text
            return page_idx, ""
    except Exception as e:
        logging.error(f"[OCR] Error processing PDF page {page_idx}: {e}", exc_info=True)
        return page_idx, f"[Error on page {page_idx}]"

def extract_text_from_pdf(pdf_path):
    """
    Extract text from a PDF file using OCR if needed
    Using parallel processing for better performance
    """
    try:
        # First try to extract text directly (if PDF has text layer)
        pdf_reader = PdfReader(pdf_path)
        max_workers = min(os.cpu_count() or 2, 4)  # Limit to 4 threads max
        
        # Start with direct text extraction from PDF
        text_results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_pdf_page, i, page, False): i 
                      for i, page in enumerate(pdf_reader.pages)}
            
            for future in concurrent.futures.as_completed(futures):
                page_idx, text = future.result()
                text_results[page_idx] = text

        # Check if we got enough text directly
        direct_text = "\n\n".join([text for _, text in sorted(text_results.items())])
        if len(direct_text.strip()) > 100:  # Threshold can be adjusted
            return direct_text
            
        # If not enough text, use OCR in parallel
        images = pdf_image_conversion(pdf_path)
        logging.info(f"[OCR] Using parallel OCR with {max_workers} workers for {len(images)} PDF pages")
        
        ocr_results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_pdf_page, i, None, True, pdf_path, images): i 
                      for i in range(len(images))}
            
            for future in concurrent.futures.as_completed(futures):
                page_idx, text = future.result()
                ocr_results[page_idx] = text
        
        # Combine results in page order
        extracted_text = "\n\n".join([text for _, text in sorted(ocr_results.items())])
        
        # Force garbage collection to free memory
        gc.collect()
        
        return extracted_text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""

def pdf_image_conversion(pdf_path):
    """
    Convert PDF to images for OCR processing
    """
    try:
        return pdf2image.convert_from_path(
            pdf_path, 
            dpi=OCR_CONFIG['dpi'],
            output_folder=tempfile.gettempdir(),
            fmt='png'
        )
    except Exception as e:
        print(f"Error converting PDF to images: {e}")
        return []

def extract_text_from_docx(docx_path):
    """
    Extract text from a DOCX file
    """
    try:
        text = docx2txt.process(docx_path)
        return text
    except Exception as e:
        print(f"Error extracting text from DOCX: {e}")
        return ""

def process_document(file_path):
    """
    Process a document file based on its extension
    """
    try:
        # Check file size first to optimize processing
        try:
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            if file_size_mb > 10:
                logging.warning(f"[OCR] Large file detected: {file_path} - {file_size_mb:.2f}MB")
                if file_size_mb > 50:
                    logging.error(f"[OCR] File too large for processing: {file_path} - {file_size_mb:.2f}MB")
                    return f"Error: File too large for processing ({file_size_mb:.2f}MB). Maximum recommended size is 50MB."
        except Exception as e:
            logging.error(f"[OCR] Error checking file size: {e}")
        
        _, ext = os.path.splitext(file_path)
        ext = ext.lower()
        logging.info(f"[OCR] Processing file {file_path} with extension {ext}")
        
        # Extract text based on file type
        if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif']:
            # For PNG files, use enhanced processing
            if ext == '.png':
                logging.info(f"[OCR] Using enhanced PNG processing for {file_path}")
                text = extract_text_from_image(file_path)
                if not text or len(text.strip()) < 50:
                    # If little or no text was extracted, try more aggressive approaches
                    logging.warning(f"[OCR] Limited text from PNG file {file_path}, trying alternative methods")
                    # Try converting image to different formats
                    try:
                        image = Image.open(file_path)
                        # Try grayscale conversion
                        gray_image = image.convert('L')
                        with tempfile.NamedTemporaryFile(suffix='.tiff') as tmp:
                            gray_image.save(tmp.name)
                            tiff_text = extract_text_from_image(tmp.name)
                            if len(tiff_text) > len(text):
                                text = tiff_text
                                logging.info(f"[OCR] Got better results from TIFF conversion: {len(text)} chars")
                    except Exception as e:
                        logging.error(f"[OCR] Format conversion failed: {e}")
            else:
                text = extract_text_from_image(file_path)
            
            logging.info(f"[OCR] Extracted {len(text)} characters from image")
        elif ext == '.pdf':
            text = extract_text_from_pdf(file_path)
            logging.info(f"[OCR] Extracted {len(text)} characters from PDF")
        elif ext in ['.docx', '.doc']:
            text = extract_text_from_docx(file_path)
            logging.info(f"[OCR] Extracted {len(text)} characters from DOCX")
        elif ext in ['.txt', '.text']:
            # Handle plain text files directly
            with open(file_path, 'r', errors='ignore') as f:
                text = f.read()
            logging.info(f"[OCR] Read {len(text)} characters from text file")
        else:
            logging.warning(f"[OCR] Unsupported file type: {ext}")
            return f"Unsupported file format: {ext}"
            
        # If very little text was extracted, try alternative methods
        if len(text.strip()) < 50:
            logging.warning(f"[OCR] Very little text extracted from {file_path}, trying alternative methods")
            
            # For all file types, try converting to image and processing
            if ext == '.pdf':
                try:
                    # Convert first page to image and retry
                    images = pdf_image_conversion(file_path)
                    if images:
                        backup_text = extract_text_from_image(images[0])
                        if len(backup_text) > len(text):
                            text = backup_text
                            logging.info(f"[OCR] Used image conversion for PDF, got {len(text)} chars")
                except Exception as backup_err:
                    logging.error(f"[OCR] Backup extraction failed: {backup_err}")
            elif ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif']:
                # For images, try with different preprocessing
                try:
                    # Load the image directly without preprocessing
                    image = Image.open(file_path)
                    direct_text = pytesseract.image_to_string(image, lang=OCR_CONFIG['lang'])
                    if len(direct_text) > len(text):
                        text = direct_text
                        logging.info(f"[OCR] Used direct image OCR, got {len(text)} chars")
                except Exception as img_err:
                    logging.error(f"[OCR] Alternative image OCR failed: {img_err}")
        
        # Log a sample of the extracted text for debugging
        if text:
            logging.info(f"[OCR] Sample of extracted text: {text[:100]}...")
        else:
            logging.warning(f"[OCR] No text was extracted from {file_path}")
            
        return text
    except Exception as e:
        logging.error(f"[OCR] Error processing document: {e}", exc_info=True)
        return f"Error processing document: {str(e)}"

def clean_extracted_text(text):
    """
    Clean and normalize extracted text
    """
    if not text:
        return ""
        
    # Convert to string if not already
    if not isinstance(text, str):
        text = str(text)
        
    # Remove excessive whitespace but preserve line breaks for structure
    text = re.sub(r' {2,}', ' ', text)  # Multiple spaces to single space
    text = re.sub(r'\n{3,}', '\n\n', text)  # Multiple newlines to double newline
    
    # Remove unusual characters but keep more symbols that might be important
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)
    
    # Log cleaning results
    logging.info(f"[OCR] Text cleaning: before {len(text) if text else 0} chars, after {len(text.strip()) if text else 0} chars")
    
    return text.strip()

def extract_document_metadata(file_path):
    """
    Extract metadata from document if available
    """
    metadata = {
        "filename": os.path.basename(file_path),
        "file_size": os.path.getsize(file_path),
        "file_type": os.path.splitext(file_path)[1].lower(),
    }
    # Add more metadata extraction based on file type
    return metadata
