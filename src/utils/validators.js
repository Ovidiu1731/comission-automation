/**
 * Input validation utilities
 */
import { SETTER_CALLER_NAME_REGEX } from '../config/constants.js';
import { logger } from './logger.js';

/**
 * Validate if a string is a valid setter/caller name
 * Must match CamelCase format: FirstNameLastName (e.g., "AbagiuMario")
 * 
 * @param {string} name - Name to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidSetterCallerName(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  // Must match CamelCase pattern
  if (!SETTER_CALLER_NAME_REGEX.test(name)) {
    return false;
  }
  
  // Additional checks: not too short, not all caps
  if (name.length < 3) {
    return false;
  }
  
  return true;
}

/**
 * Validate sales rep role
 * Only "Sales" role commissions should be processed
 * 
 * @param {string|Array<string>} role - Role(s) from commission record
 * @returns {boolean} - True if it's a Sales role
 */
export function isSalesRole(role) {
  if (!role) {
    return false;
  }
  
  // Role can be a string or array of strings
  const roles = Array.isArray(role) ? role : [role];
  
  // Check if any role is "Sales" and not Caller or Setter
  return roles.some(r => r === 'Sales') && 
         !roles.some(r => r === 'Caller' || r === 'Setter');
}

/**
 * Validate expense amount
 * Must be a positive number
 * 
 * @param {number} amount - Expense amount
 * @returns {boolean} - True if valid
 */
export function isValidExpenseAmount(amount) {
  return typeof amount === 'number' && 
         !isNaN(amount) && 
         isFinite(amount) && 
         amount > 0;
}

/**
 * Validate project name
 * 
 * @param {string} project - Project name
 * @returns {boolean} - True if not empty
 */
export function isValidProject(project) {
  return typeof project === 'string' && project.trim().length > 0;
}

/**
 * Extract setter/caller name from Utm Campaign field
 * Returns null if invalid
 * 
 * @param {string} utmCampaign - Value from Utm Campaign field
 * @returns {string|null} - Valid name or null
 */
export function extractSetterCallerName(utmCampaign) {
  if (!utmCampaign) {
    return null;
  }
  
  // Split by common separators (comma, semicolon, pipe, dash)
  const candidates = utmCampaign.split(/[,;|\-\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // Find first valid name
  for (const candidate of candidates) {
    if (isValidSetterCallerName(candidate)) {
      logger.debug('Extracted valid name from Utm Campaign', { 
        utmCampaign, 
        extractedName: candidate 
      });
      return candidate;
    }
  }
  
  return null;
}

/**
 * Log validation warnings for debugging
 * 
 * @param {string} type - Type of validation (e.g., 'name', 'role')
 * @param {*} value - The value that failed validation
 * @param {string} reason - Reason for failure
 */
export function logValidationWarning(type, value, reason) {
  logger.warn('Validation failed', {
    type,
    value: String(value),
    reason
  });
}

