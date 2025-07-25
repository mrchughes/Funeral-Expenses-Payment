// Utility functions for validating form fields

export function validatePostcode(postcode) {
  // UK postcode regex (simple version)
  return /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(postcode.trim());
}

export function validateNINO(nino) {
  // UK National Insurance Number regex
  return /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/i.test(nino.trim().replace(/\s/g, ''));
}

export function validatePhoneNumber(phone) {
  // UK phone number (basic)
  return /^\+?\d{10,15}$/.test(phone.trim().replace(/\s/g, ''));
}

export function validateEmail(email) {
  // Simple email regex
  return /^\S+@\S+\.\S+$/.test(email.trim());
}
