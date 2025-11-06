/**
 * Facebook Ads Expense Processing
 * 
 * Fetches ad spend data from Facebook Marketing API and creates expense records
 * grouped by project in Airtable.
 */
import axios from 'axios';
import {
  getExpenseByExpenseId,
  createExpense,
  updateExpense,
  getAllMonthYearsFromSales
} from './airtableService.js';
import { ensureValidToken } from './facebookTokenService.js';
import {
  FIELDS,
  EXPENSE_CATEGORIES,
  VAT_INCLUDED,
  SOURCE,
  FACEBOOK,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import {
  isValidExpenseAmount,
  isValidProject
} from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Normalize string for comparison (remove diacritics, lowercase)
 * @param {string} str - String to normalize
 * @returns {string} - Normalized string
 */
function normalizeString(str) {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .replace(/ă/g, 'a')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/ș/g, 's')
    .replace(/ț/g, 't')
    .trim();
}

/**
 * Map Facebook campaign name to project
 * Uses substring matching with normalized strings
 * @param {string} campaignName - Facebook campaign name
 * @returns {string} - Project name or default project for unmapped
 */
export function mapCampaignToProject(campaignName) {
  if (!campaignName) {
    logger.warn('Campaign with empty name, mapping to default project');
    return FACEBOOK.defaultProject;
  }
  
  const normalizedCampaign = normalizeString(campaignName);
  
  // Try to match against each project
  for (const project of FACEBOOK.projects) {
    const normalizedProject = normalizeString(project);
    
    if (normalizedCampaign.includes(normalizedProject)) {
      logger.debug(`Campaign "${campaignName}" → Project "${project}"`);
      return project;
    }
  }
  
  // No match found
  logger.debug(`Campaign "${campaignName}" → No match, using "${FACEBOOK.defaultProject}"`);
  return FACEBOOK.defaultProject;
}

/**
 * Verify Ad Account currency is RON
 * @param {string} adAccountId - Facebook Ad Account ID (e.g., "act_123456")
 * @param {string} accessToken - Facebook access token
 * @returns {Promise<boolean>} - True if currency is RON
 */
async function verifyAdAccountCurrency(adAccountId, accessToken) {
  try {
    const url = `${FACEBOOK.baseUrl}/${FACEBOOK.apiVersion}/${adAccountId}`;
    
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        fields: 'currency'
      },
      timeout: FACEBOOK.timeout
    });
    
    const currency = response.data?.currency;
    
    if (currency !== FACEBOOK.expectedCurrency) {
      logger.error('❌ Ad Account currency mismatch!', {
        expected: FACEBOOK.expectedCurrency,
        actual: currency,
        adAccountId
      });
      logger.error('   Please change Ad Account currency in Facebook Business Manager');
      return false;
    }
    
    logger.info('✓ Ad Account currency verified', { currency });
    return true;
  } catch (error) {
    logger.error('Failed to verify Ad Account currency', {
      error: error.message,
      response: error.response?.data,
      adAccountId
    });
    return false;
  }
}

/**
 * Fetch ad spend data from Facebook Marketing API
 * @param {string} adAccountId - Facebook Ad Account ID
 * @param {string} accessToken - Facebook access token
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} - Array of campaign spend data
 */
async function fetchAdSpend(adAccountId, accessToken, startDate, endDate) {
  try {
    const url = `${FACEBOOK.baseUrl}/${FACEBOOK.apiVersion}/${adAccountId}/insights`;
    
    logger.info('Fetching Facebook Ads data', {
      adAccountId,
      dateRange: `${startDate} to ${endDate}`
    });
    
    const params = {
      access_token: accessToken,
      level: 'campaign',
      fields: 'campaign_name,spend',
      time_range: JSON.stringify({
        since: startDate,
        until: endDate
      }),
      limit: 100
    };
    
    const allCampaigns = [];
    let nextUrl = url;
    let pageCount = 0;
    const maxPages = 10; // Safety limit
    
    // Handle pagination
    while (nextUrl && pageCount < maxPages) {
      const response = await axios.get(nextUrl, {
        params: pageCount === 0 ? params : undefined,
        timeout: FACEBOOK.timeout
      });
      
      const campaigns = response.data?.data || [];
      allCampaigns.push(...campaigns);
      
      pageCount++;
      logger.debug(`Fetched page ${pageCount}, campaigns: ${campaigns.length}`);
      
      // Check for next page
      nextUrl = response.data?.paging?.next || null;
      
      // Rate limit safety: small delay between pages
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    logger.info('Facebook Ads data fetched', {
      totalCampaigns: allCampaigns.length,
      pages: pageCount
    });
    
    return allCampaigns;
  } catch (error) {
    // Handle rate limit errors
    if (error.response?.data?.error?.code === 17 || error.response?.data?.error?.code === 80004) {
      logger.error('Facebook API rate limit exceeded', {
        error: error.message,
        retryAfter: error.response?.headers?.['retry-after'] || 'unknown'
      });
      throw new Error('RATE_LIMIT_EXCEEDED');
    }
    
    // Handle token errors
    if (error.response?.data?.error?.code === 190) {
      logger.error('Facebook access token is invalid or expired', {
        error: error.response?.data?.error
      });
      throw new Error('INVALID_TOKEN');
    }
    
    logger.error('Failed to fetch Facebook Ads data', {
      error: error.message,
      response: error.response?.data
    });
    
    throw error;
  }
}

/**
 * Group campaign spend by project
 * @param {Array} campaigns - Array of campaign data from Facebook API
 * @returns {Object} - Grouped spend by project
 */
function groupSpendByProject(campaigns) {
  const grouped = {};
  
  for (const campaign of campaigns) {
    const campaignName = campaign.campaign_name;
    const spend = parseFloat(campaign.spend || 0);
    
    // Skip campaigns with no spend
    if (spend <= 0) {
      logger.debug(`Skipping campaign with zero spend: ${campaignName}`);
      continue;
    }
    
    // Map campaign to project
    const project = mapCampaignToProject(campaignName);
    
    // Initialize project group if needed
    if (!grouped[project]) {
      grouped[project] = {
        project,
        totalSpend: 0,
        campaignCount: 0,
        campaigns: []
      };
    }
    
    // Add to group
    grouped[project].totalSpend += spend;
    grouped[project].campaignCount++;
    grouped[project].campaigns.push({
      name: campaignName,
      spend
    });
  }
  
  return grouped;
}

/**
 * Format number with thousand separators
 * @param {number} number - Number to format
 * @returns {string} - Formatted number
 */
function formatNumberWithCommas(number) {
  return (Math.round(number * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Create or update Facebook Ads expense record
 * @param {Object} group - Grouped spend data
 * @param {string} month - Month name (e.g., "Octombrie")
 * @param {number} year - Year
 * @returns {Promise<string>} - 'created', 'updated', or null
 */
async function createOrUpdateFacebookAdsExpense(group, month, year) {
  const { project, campaignCount, totalSpend } = group;
  
  // Round spend to 2 decimals
  const roundedSpend = Math.round(totalSpend * 100) / 100;
  
  // Validate spend amount
  if (!isValidExpenseAmount(roundedSpend)) {
    logger.warn('Invalid Facebook Ads spend amount, skipping', {
      project,
      spend: roundedSpend
    });
    return null;
  }
  
  // Generate unique expense ID: facebook_ads_{project}_{month}
  const expenseId = `facebook_ads_${project}_${month}`.replace(/\s+/g, '_');
  
  // Format spend for description
  const formattedSpend = formatNumberWithCommas(totalSpend);
  
  // Prepare expense data
  const expenseFields = {
    [FIELDS.EXPENSE_DESCRIPTION]: `Facebook Ads - ${project} (${campaignCount} campanii, ${formattedSpend} RON)`,
    [FIELDS.EXPENSE_PROJECT]: project,
    [FIELDS.EXPENSE_CATEGORY]: EXPENSE_CATEGORIES.MARKETING,
    [FIELDS.EXPENSE_AMOUNT]: roundedSpend,
    [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO, // Facebook ads - VAT not included
    [FIELDS.EXPENSE_MONTH]: month,
    [FIELDS.EXPENSE_YEAR]: year,
    [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
    [FIELDS.EXPENSE_ID]: expenseId
  };
  
  try {
    // Check if expense already exists
    const existingExpense = await getExpenseByExpenseId(expenseId);
    
    if (existingExpense) {
      logger.info('Updating existing Facebook Ads expense', {
        expenseId,
        project,
        oldAmount: existingExpense.amount,
        newAmount: roundedSpend,
        campaignCount
      });
      
      await updateExpense(existingExpense.id, {
        fields: expenseFields
      });
      
      logger.info('Facebook Ads expense updated successfully', {
        expenseId,
        project,
        amount: roundedSpend
      });
      
      return 'updated';
    } else {
      logger.info('Creating new Facebook Ads expense', {
        expenseId,
        project,
        amount: roundedSpend,
        campaignCount
      });
      
      await createExpense({
        fields: expenseFields
      });
      
      logger.info('Facebook Ads expense created successfully', {
        expenseId,
        project,
        amount: roundedSpend
      });
      
      return 'created';
    }
  } catch (error) {
    logger.error('Failed to create/update Facebook Ads expense', {
      error: error.message,
      project,
      expenseId
    });
    throw error;
  }
}

/**
 * Helper function to convert Romanian month name to month number (1-12)
 */
function romanianMonthToNumber(month) {
  const months = {
    'Ianuarie': 1,
    'Februarie': 2,
    'Martie': 3,
    'Aprilie': 4,
    'Mai': 5,
    'Iunie': 6,
    'Iulie': 7,
    'August': 8,
    'Septembrie': 9,
    'Octombrie': 10,
    'Noiembrie': 11,
    'Decembrie': 12
  };
  return months[month] || new Date().getMonth() + 1;
}

/**
 * Helper function to get the last day of a month
 */
function getLastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Main function to process Facebook Ads expenses
 * @param {string} targetMonthYear - Optional. Format: "Luna YYYY" (e.g., "Octombrie 2025"). If provided, only processes that month.
 * @returns {Promise<Object>} - Processing statistics
 */
export async function processFacebookAds(targetMonthYear = null) {
  if (targetMonthYear) {
    logger.info(`=== Processing Facebook Ads Expenses for: ${targetMonthYear} ===`);
  } else {
    logger.info('=== Processing Facebook Ads Expenses for ALL months ===');
  }
  
  try {
    let monthYears = await getAllMonthYearsFromSales();
    
    // If targetMonthYear is provided, filter to only that month
    if (targetMonthYear) {
      monthYears = monthYears.filter(my => my === targetMonthYear);
      logger.info(`Filtered to single month-year: ${targetMonthYear}`);
    }
    
    if (monthYears.length === 0) {
      return {
        campaignsProcessed: 0,
        projectsWithSpend: 0,
        totalSpend: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    logger.info(`Processing Facebook Ads for ${monthYears.length} month-years: ${monthYears.join(', ')}`);
    
    let totalStats = {
      campaignsProcessed: 0,
      projectsWithSpend: 0,
      totalSpend: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
    
    for (const monthYear of monthYears) {
      logger.info(`\n========== Processing Facebook Ads for: ${monthYear} ==========`);
      const result = await processFacebookAdsForMonthYear(monthYear);
      totalStats.campaignsProcessed += result.campaignsProcessed;
      totalStats.projectsWithSpend += result.projectsWithSpend;
      totalStats.totalSpend += result.totalSpend;
      totalStats.created += result.created;
      totalStats.updated += result.updated;
      totalStats.skipped += result.skipped;
      totalStats.errors += result.errors;
    }
    
    logger.info('Completed Facebook Ads processing', { targetMonthYear, ...totalStats });
    return totalStats;
  } catch (error) {
    logger.error('Facebook Ads processing failed', {
      error: error.message,
      stack: error.stack,
      targetMonthYear
    });
    throw error;
  }
}

/**
 * Process Facebook Ads expenses for a specific month-year
 * @param {string} monthYear - Month-year string (e.g., "Octombrie 2025")
 * @returns {Promise<Object>} - Processing statistics
 */
async function processFacebookAdsForMonthYear(monthYear) {
  // Parse month-year (format: "Luna YYYY")
  const parts = monthYear.split(' ');
  const month = parts[0];
  const year = parseInt(parts[1]);
  
  logger.info('Processing Facebook Ads for month-year', { monthYear, month, year });
  
  const stats = {
    campaignsProcessed: 0,
    projectsWithSpend: 0,
    totalSpend: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };
  
  try {
    // Get environment variables
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    
    if (!adAccountId || !accessToken) {
      logger.error('Missing Facebook API credentials');
      logger.error('Required: FACEBOOK_AD_ACCOUNT_ID, FACEBOOK_ACCESS_TOKEN');
      throw new Error('Missing Facebook API credentials');
    }
    
    // Validate access token
    const isTokenValid = await ensureValidToken(accessToken);
    if (!isTokenValid) {
      throw new Error('Invalid or expired Facebook access token');
    }
    
    // Verify Ad Account currency
    const isCurrencyValid = await verifyAdAccountCurrency(adAccountId, accessToken);
    if (!isCurrencyValid) {
      throw new Error('Ad Account currency is not RON');
    }
    
    // Calculate date range for the specific month
    const monthNumber = romanianMonthToNumber(month);
    const lastDay = getLastDayOfMonth(year, monthNumber);
    const startDate = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    logger.info('Fetching Facebook Ads data for date range', { startDate, endDate });
    
    // Fetch ad spend data
    const campaigns = await fetchAdSpend(adAccountId, accessToken, startDate, endDate);
    
    if (campaigns.length === 0) {
      logger.info('No Facebook campaigns found for this month-year', { monthYear });
      return stats;
    }
    
    stats.campaignsProcessed = campaigns.length;
    
    // Group spend by project
    const groupedSpend = groupSpendByProject(campaigns);
    const projects = Object.values(groupedSpend);
    
    stats.projectsWithSpend = projects.length;
    stats.totalSpend = projects.reduce((sum, p) => sum + p.totalSpend, 0);
    
    logger.info('Facebook Ads grouping complete', {
      campaignsProcessed: stats.campaignsProcessed,
      projectsWithSpend: stats.projectsWithSpend,
      totalSpend: stats.totalSpend.toFixed(2) + ' RON'
    });
    
    // Log breakdown by project
    for (const group of projects) {
      logger.info(`Project: ${group.project}`, {
        campaigns: group.campaignCount,
        spend: group.totalSpend.toFixed(2) + ' RON'
      });
    }
    
    // Create/update expense records
    logger.info(`Creating/updating ${projects.length} Facebook Ads expense records`);
    
    for (const group of projects) {
      try {
        const result = await createOrUpdateFacebookAdsExpense(group, month, year);
        if (result === 'created') {
          stats.created++;
        } else if (result === 'updated') {
          stats.updated++;
        }
      } catch (error) {
        logger.error('Failed to create/update Facebook Ads expense', {
          error: error.message,
          project: group.project
        });
        stats.errors++;
      }
    }
    
    logger.info('=== Facebook Ads Processing Complete ===', {
      campaignsProcessed: stats.campaignsProcessed,
      projectsWithSpend: stats.projectsWithSpend,
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.errors,
      totalSpend: stats.totalSpend.toFixed(2) + ' RON'
    });
    
    return stats;
  } catch (error) {
    logger.error('Facebook Ads processing failed for month-year', {
      monthYear,
      error: error.message,
      stack: error.stack
    });
    
    // Return stats even on error
    stats.errors++;
    return stats;
  }
}

