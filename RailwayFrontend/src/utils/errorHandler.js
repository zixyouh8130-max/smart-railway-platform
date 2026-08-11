// utils/errorHandler.js

/**
 * Extract a readable error message from various error formats
 */
export const getErrorMessage = (error) => {
  // FastAPI validation errors
  if (error.detail) {
    if (Array.isArray(error.detail)) {
      return error.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
    }
    return String(error.detail);
  }
  
  // Axios errors
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (Array.isArray(detail)) {
      return detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
    }
    return String(detail);
  }
  
  // Standard Error
  if (error.message) {
    return error.message;
  }
  
  // String error
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred';
};