/**
 * Facebook Access Token Management
 * 
 * Handles token validation, expiry checking, and automatic refresh
 * for Facebook Marketing API access tokens.
 */
import axios from 'axios';
import { FACEBOOK } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Check if access token is valid and get its expiry info
 * @param {string} accessToken - Facebook access token
 * @returns {Promise<{isValid: boolean, expiresAt: Date|null, expiresIn: number|null}>}
 */
export async function checkTokenExpiry(accessToken) {
  try {
    const url = `${FACEBOOK.baseUrl}/debug_token`;
    
    const response = await axios.get(url, {
      params: {
        input_token: accessToken,
        access_token: accessToken // Can use same token to debug itself
      },
      timeout: FACEBOOK.timeout
    });
    
    const data = response.data?.data;
    
    if (!data) {
      logger.error('Invalid token debug response', { response: response.data });
      return { isValid: false, expiresAt: null, expiresIn: null };
    }
    
    const isValid = data.is_valid === true;
    const expiresAt = data.expires_at ? new Date(data.expires_at * 1000) : null;
    const expiresIn = data.expires_at ? (data.expires_at - Math.floor(Date.now() / 1000)) : null;
    
    logger.info('Token expiry check', {
      isValid,
      expiresAt: expiresAt ? expiresAt.toISOString() : 'never',
      expiresInDays: expiresIn ? Math.floor(expiresIn / (24 * 60 * 60)) : 'N/A'
    });
    
    return { isValid, expiresAt, expiresIn };
  } catch (error) {
    logger.error('Failed to check token expiry', {
      error: error.message,
      response: error.response?.data
    });
    
    // If we can't check, assume token might be invalid
    return { isValid: false, expiresAt: null, expiresIn: null };
  }
}

/**
 * Refresh a short-lived or expiring access token to get a new long-lived token
 * @param {string} appId - Facebook App ID
 * @param {string} appSecret - Facebook App Secret
 * @param {string} currentToken - Current access token
 * @returns {Promise<{success: boolean, accessToken: string|null, expiresIn: number|null, error: string|null}>}
 */
export async function refreshAccessToken(appId, appSecret, currentToken) {
  try {
    logger.info('Attempting to refresh Facebook access token');
    
    const url = `${FACEBOOK.baseUrl}/${FACEBOOK.apiVersion}/oauth/access_token`;
    
    const response = await axios.get(url, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: currentToken
      },
      timeout: FACEBOOK.timeout
    });
    
    const { access_token, expires_in } = response.data;
    
    if (!access_token) {
      logger.error('Token refresh returned no access_token', { response: response.data });
      return {
        success: false,
        accessToken: null,
        expiresIn: null,
        error: 'No access_token in response'
      };
    }
    
    logger.info('Access token refreshed successfully', {
      expiresIn: expires_in,
      expiresInDays: expires_in ? Math.floor(expires_in / (24 * 60 * 60)) : 'N/A'
    });
    
    return {
      success: true,
      accessToken: access_token,
      expiresIn: expires_in,
      error: null
    };
  } catch (error) {
    logger.error('Failed to refresh access token', {
      error: error.message,
      response: error.response?.data
    });
    
    return {
      success: false,
      accessToken: null,
      expiresIn: null,
      error: error.message
    };
  }
}

/**
 * Ensure the access token is valid and not expiring soon
 * Logs warnings if token is expiring soon
 * @param {string} accessToken - Facebook access token
 * @returns {Promise<boolean>} - True if token is valid and not expiring soon
 */
export async function ensureValidToken(accessToken) {
  const { isValid, expiresIn } = await checkTokenExpiry(accessToken);
  
  if (!isValid) {
    logger.error('❌ Facebook access token is INVALID or EXPIRED!');
    logger.error('   Action required: Generate new token from Facebook Graph API Explorer');
    logger.error('   Update Railway env var: FACEBOOK_ACCESS_TOKEN');
    return false;
  }
  
  // Check if token expires soon (within warning days)
  if (expiresIn !== null) {
    const daysUntilExpiry = Math.floor(expiresIn / (24 * 60 * 60));
    
    if (daysUntilExpiry < FACEBOOK.tokenExpiryWarningDays) {
      logger.warn(`⚠️  Facebook access token expires in ${daysUntilExpiry} days!`);
      logger.warn('   Consider refreshing token soon');
      logger.warn('   Use refreshAccessToken() function or generate new token from Facebook');
    }
  }
  
  return true;
}

/**
 * Get debug info about the access token
 * Useful for troubleshooting
 * @param {string} accessToken - Facebook access token
 * @returns {Promise<object|null>} - Debug data or null if failed
 */
export async function getTokenDebugInfo(accessToken) {
  try {
    const url = `${FACEBOOK.baseUrl}/debug_token`;
    
    const response = await axios.get(url, {
      params: {
        input_token: accessToken,
        access_token: accessToken
      },
      timeout: FACEBOOK.timeout
    });
    
    return response.data?.data || null;
  } catch (error) {
    logger.error('Failed to get token debug info', {
      error: error.message
    });
    return null;
  }
}

