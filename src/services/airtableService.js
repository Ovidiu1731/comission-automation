/**
 * Airtable service layer - handles all database operations
 */
import { base } from '../config/airtable.js';
import { TABLES, FIELDS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Rate limiting: Airtable allows 5 requests/second
 */
const RATE_LIMIT_DELAY = 250; // 4 requests/second to be safe
let lastRequestTime = 0;

/**
 * Wait to respect rate limits
 */
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => 
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest)
    );
  }
  
  lastRequestTime = Date.now();
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await waitForRateLimit();
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        logger.error('=== RETRY EXHAUSTED START ===');
        logger.error('Typeof error:', typeof error);
        logger.error('Error constructor:', error?.constructor?.name || 'NO CONSTRUCTOR');
        logger.error('Error message:', error?.message || 'NO MESSAGE');
        logger.error('Error statusCode:', error?.statusCode || 'NO STATUS CODE');
        logger.error('Error string:', String(error));
        logger.error('Error properties:', Object.getOwnPropertyNames(error || {}));
        logger.error('=== RETRY EXHAUSTED END ===');
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`Request failed, retrying...`, {
        attempt,
        maxAttempts,
        delay: `${delay}ms`,
        error: error.message,
        statusCode: error.statusCode
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get all monthly commission records for current month
 * Filtered by role = "Sales" only
 */
export async function getMonthlyCommissions(month) {
  logger.info('Fetching monthly commissions', { month });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.MONTHLY_COMMISSIONS)
        .select({
          filterByFormula: `{${FIELDS.MONTH}} = "${month}"`,
          maxRecords: 1000
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const role = record.get(FIELDS.ROLE);
            // Only include if role contains "Sales" and not Caller/Setter
            const roles = Array.isArray(role) ? role : [role];
            const isSales = roles.some(r => r === 'Sales') && 
                          !roles.some(r => r === 'Caller' || r === 'Setter');
            
            if (isSales) {
              results.push({
                id: record.id,
                name: record.get(FIELDS.NAME),
                representative: record.get(FIELDS.REPRESENTATIVE),
                month: record.get(FIELDS.MONTH),
                finalCommission: record.get(FIELDS.FINAL_COMMISSION),
                sales: record.get(FIELDS.SALES) || [],
                role: roles
              });
            } else {
              logger.debug('Skipping commission - not Sales role', {
                id: record.id,
                role: roles
              });
            }
          });
          
          fetchNextPage();
        });
    });
    
    logger.info('Fetched monthly commissions', { 
      count: results.length,
      month 
    });
    
    return results;
  } catch (error) {
    logger.error('Failed to fetch monthly commissions', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get all monthly commission records for Setters/Callers for current month
 * Filtered by role = "Caller" or "Setter"
 */
export async function getMonthlySetterCallerCommissions(month) {
  logger.info('Fetching monthly Setter/Caller commissions', { month });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.MONTHLY_COMMISSIONS)
        .select({
          filterByFormula: `{${FIELDS.MONTH}} = "${month}"`,
          maxRecords: 1000
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const role = record.get(FIELDS.ROLE);
            const setterCallerCommission = record.get(FIELDS.SETTER_CALLER_SUM);
            
            // Only include if role contains "Caller" or "Setter" and has valid commission
            const roles = Array.isArray(role) ? role : [role];
            const isSetterCaller = roles.some(r => r === 'Caller' || r === 'Setter');
            
            if (isSetterCaller && setterCallerCommission > 0) {
              results.push({
                id: record.id,
                name: record.get(FIELDS.NAME),
                representative: record.get(FIELDS.REPRESENTATIVE),
                month: record.get(FIELDS.MONTH),
                setterCallerCommission: setterCallerCommission,
                sales: record.get(FIELDS.SALES) || [],
                role: roles
              });
            } else {
              logger.debug('Skipping commission - not Setter/Caller or zero commission', {
                id: record.id,
                role: roles,
                commission: setterCallerCommission
              });
            }
          });
          
          fetchNextPage();
        });
    });
    
    logger.info('Fetched monthly Setter/Caller commissions', { 
      count: results.length,
      month 
    });
    
    return results;
  } catch (error) {
    logger.error('Failed to fetch monthly Setter/Caller commissions', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get sale records by their IDs
 */
export async function getSalesByIds(saleIds) {
  if (!saleIds || saleIds.length === 0) {
    return [];
  }
  
  logger.info('getSalesByIds called', { count: saleIds.length, ids: saleIds.slice(0, 3) });
  
  try {
    const results = [];
    const idsToFetch = [...saleIds];
    
    // Fetch in batches (Airtable limits to ~100 IDs per request)
    logger.info('Starting batch fetching', { totalIds: idsToFetch.length });
    while (idsToFetch.length > 0) {
      const batch = idsToFetch.splice(0, 100);
      logger.info('Processing batch', { batchSize: batch.length, remaining: idsToFetch.length });
      
      await retryWithBackoff(async () => {
        logger.info('About to call Airtable select');  
        await base(TABLES.SALES)
          .select({
            filterByFormula: `OR(${batch.map(id => `RECORD_ID() = "${id}"`).join(', ')})`,
            maxRecords: 100
          })
          .eachPage((records, fetchNextPage) => {
            logger.info('eachPage callback called', { recordCount: records.length });
            records.forEach(record => {
              const saleData = {
                id: record.id,
                project: record.get(FIELDS.PROJECT),
                amountWithoutVat: record.get(FIELDS.AMOUNT_WITHOUT_VAT),
                totalAmount: record.get(FIELDS.TOTAL_AMOUNT),
                finalCommission: record.get(FIELDS.FINAL_COMMISSION_SALE),
                utmCampaign: record.get(FIELDS.UTM_CAMPAIGN),
                saleDate: record.get(FIELDS.SALE_DATE),
                monthYear: record.get(FIELDS.SALE_MONTH)
              };
              logger.debug('Fetched sale with commission', {
                id: saleData.id,
                project: saleData.project,
                commission: saleData.finalCommission
              });
              results.push(saleData);
            });
            logger.info('About to call fetchNextPage');
            fetchNextPage();
            logger.info('fetchNextPage called');
          });
      });
    }
    
    return results;
  } catch (error) {
    logger.error('Failed to fetch sales', {
      error: error.message,
      count: saleIds.length
    });
    throw error;
  }
}

/**
 * Get sales by Utm Campaign for copywriting commission processing
 * Returns ALL sales for the given month (not filtered by Utm Campaign yet)
 */
export async function getSalesByUtmCampaign(monthYear) {
  logger.info('Fetching sales for copywriting commissions', { monthYear });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.SALES)
        .select({
          filterByFormula: `{${FIELDS.SALE_MONTH}} = "${monthYear}"`,
          maxRecords: 10000
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            // Return all sales - filtering by Utm Campaign happens in the service
            results.push({
              id: record.id,
              [FIELDS.PROJECT]: record.get(FIELDS.PROJECT),
              [FIELDS.AMOUNT_WITHOUT_VAT]: record.get(FIELDS.AMOUNT_WITHOUT_VAT),
              [FIELDS.TOTAL_AMOUNT]: record.get(FIELDS.TOTAL_AMOUNT),
              [FIELDS.UTM_CAMPAIGN]: record.get(FIELDS.UTM_CAMPAIGN),
              [FIELDS.CLIENT_NAME]: record.get(FIELDS.CLIENT_NAME),
              [FIELDS.SALE_DATE]: record.get(FIELDS.SALE_DATE)
            });
          });
          
          fetchNextPage();
        });
    });
    
    logger.info('Fetched sales for copywriting processing', { 
      count: results.length,
      monthYear 
    });
    
    return results;
  } catch (error) {
    logger.error('Failed to fetch sales for copywriting', {
      error: error.message,
      monthYear
    });
    throw error;
  }
}

/**
 * Get sales for setter/caller commission processing
 */
export async function getSetterCallerSales(monthYear) {
  logger.info('Fetching sales for setter/caller commissions', { monthYear });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.SALES)
        .select({
          filterByFormula: `{${FIELDS.SALE_MONTH}} = "${monthYear}"`,
          maxRecords: 10000
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const utmCampaign = record.get(FIELDS.UTM_CAMPAIGN);
            const setterCallerCommission = record.get(FIELDS.SETTER_CALLER_COMMISSION);
            
            // Only include if Utm Campaign is not empty and commission > 0
            if (utmCampaign && setterCallerCommission > 0) {
              results.push({
                id: record.id,
                project: record.get(FIELDS.PROJECT),
                amountWithoutVat: record.get(FIELDS.AMOUNT_WITHOUT_VAT),
                totalAmount: record.get(FIELDS.TOTAL_AMOUNT),
                utmCampaign,
                setterCallerCommission
              });
            }
          });
          
          fetchNextPage();
        });
    });
    
    logger.info('=== SETTER/CALLER SALES FETCH COMPLETE ===');
    logger.info(`Total sales fetched: ${results.length}`);
    logger.info(`Month/Year filter: ${monthYear}`);
    
    if (results.length > 0) {
      logger.info('Sample sale (first record):');
      logger.info(`  ID: ${results[0].id}`);
      logger.info(`  Project: ${results[0].project}`);
      logger.info(`  Utm Campaign: ${results[0].utmCampaign}`);
      logger.info(`  Setter/Caller Commission: ${results[0].setterCallerCommission}`);
    } else {
      logger.warn('NO SALES FOUND FOR SETTER/CALLER PROCESSING');
      logger.warn('This could mean:');
      logger.warn('1. No sales have non-zero Setter/Caller commission');
      logger.warn('2. No sales have Utm Campaign filled in');
      logger.warn('3. Month/year filter is incorrect');
    }
    
    return results;
  } catch (error) {
    logger.error('Failed to fetch setter/caller sales', {
      error: error.message,
      monthYear
    });
    throw error;
  }
}

/**
 * Get representative record by name
 */
export async function getRepresentativeByName(name) {
  logger.debug('Fetching representative', { name });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.REPRESENTATIVES)
        .select({
          filterByFormula: `FIND("${name}", {${FIELDS.REP_NAME}}) > 0`,
          maxRecords: 10
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            results.push({
              id: record.id,
              name: record.get(FIELDS.REP_NAME),
              email: record.get(FIELDS.REP_EMAIL),
              cif: record.get(FIELDS.REP_CIF),
              role: record.get(FIELDS.REP_ROLE)
            });
          });
          fetchNextPage();
        });
    });
    
    // Try to find exact match first
    const exactMatch = results.find(r => r.name === name);
    if (exactMatch) {
      return exactMatch;
    }
    
    // Return first match if found
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error('Failed to fetch representative', {
      error: error.message,
      name
    });
    return null;
  }
}

/**
 * Find representative by fuzzy name match (case-insensitive, partial match)
 * Used for normalizing setter/caller names from Utm Campaign
 * @returns {Object|null} - Object with {name, role} or null if not found
 */
export async function findRepresentativeByFuzzyName(searchName) {
  if (!searchName || typeof searchName !== 'string') {
    return null;
  }
  
  const normalizedSearch = searchName.toLowerCase().trim();
  
  logger.debug('Searching for representative with fuzzy match', { 
    searchName, 
    normalizedSearch 
  });
  
  try {
    const allRepresentatives = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.REPRESENTATIVES)
        .select({
          maxRecords: 500
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const name = record.get(FIELDS.REP_NAME);
            const role = record.get(FIELDS.REP_ROLE);
            
            // Only include Callers and Setters
            if (name && (role === 'Caller' || role === 'Setter')) {
              allRepresentatives.push({
                id: record.id,
                name: name,
                role: role,
                normalizedName: name.toLowerCase()
              });
            }
          });
          
          fetchNextPage();
        });
    });
    
    logger.info(`Found ${allRepresentatives.length} Callers/Setters to check against`);
    
    // 1. Try exact match (case-insensitive)
    let match = allRepresentatives.find(rep => 
      rep.normalizedName === normalizedSearch
    );
    
    if (match) {
      logger.info('Found exact fuzzy match', {
        searchName,
        matchedName: match.name,
        role: match.role
      });
      return { name: match.name, role: match.role };
    }
    
    // 2. Try partial match: name contains search or search contains name
    match = allRepresentatives.find(rep => 
      rep.normalizedName.includes(normalizedSearch) || 
      normalizedSearch.includes(rep.normalizedName)
    );
    
    if (match) {
      logger.info('Found partial fuzzy match', {
        searchName,
        matchedName: match.name,
        role: match.role
      });
      return { name: match.name, role: match.role };
    }
    
    // 3. Try similarity match for typos (e.g., OpescuEric vs OprescuEric)
    const closeMatches = allRepresentatives.filter(rep => {
      const similarity = calculateSimilarity(rep.normalizedName, normalizedSearch);
      // Accept if 85% or more similar (allows 1-2 char differences)
      return similarity >= 0.85 && similarity < 1.0;
    });
    
    if (closeMatches.length === 1) {
      match = closeMatches[0];
      logger.info('Found similar fuzzy match (possible typo)', {
        searchName,
        matchedName: match.name,
        role: match.role
      });
      return { name: match.name, role: match.role };
    }
    
    if (closeMatches.length > 1) {
      logger.warn('Multiple similar matches found, cannot determine correct one', {
        searchName,
        matches: closeMatches.map(m => m.name)
      });
    }
    
    logger.warn('No fuzzy match found for setter/caller name', {
      searchName,
      representativesChecked: allRepresentatives.length
    });
    
    return null;
  } catch (error) {
    logger.error('Failed to perform fuzzy name search', {
      searchName,
      error: error.message
    });
    return null;
  }
}

/**
 * Calculate string similarity using Levenshtein distance
 * Returns value between 0 (completely different) and 1 (identical)
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) {
    return 1.0;
  }
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 */
function getEditDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Check if expense already exists by ID
 */
export async function expenseExists(expenseId) {
  logger.info('expenseExists called', { expenseId });
  try {
    let exists = false;
    
    await retryWithBackoff(async () => {
      logger.info('About to check expense existence in Airtable', { expenseId });
      await base(TABLES.EXPENSES)
        .select({
          filterByFormula: `{${FIELDS.EXPENSE_ID}} = "${expenseId}"`,
          maxRecords: 1
        })
        .eachPage((records, fetchNextPage) => {
          logger.info('expenseExists eachPage called', { recordCount: records.length });
          exists = records.length > 0;
          fetchNextPage();
        });
      logger.info('Expense check complete', { expenseId, exists });
    });
    
    return exists;
  } catch (error) {
    logger.error('Failed to check expense existence', {
      error: error.message,
      expenseId
    });
    // If check fails, assume it exists to prevent duplicates
    return true;
  }
}

/**
 * Create expense record in Cheltuieli table
 */
export async function createExpense(expenseData) {
  const expenseId = expenseData.fields?.[FIELDS.EXPENSE_ID];
  
  logger.info('Creating expense record', { 
    expenseId,
    fullData: JSON.stringify(expenseData, null, 2)
  });
  
  try {
    await retryWithBackoff(async () => {
      logger.info('Attempting Airtable create', { expenseId });
      await base(TABLES.EXPENSES).create([expenseData]);
      logger.info('Airtable create successful', { expenseId });
    });
    
    logger.info('Created expense record', { 
      expenseId,
      project: expenseData.fields?.[FIELDS.EXPENSE_PROJECT],
      category: expenseData.fields?.[FIELDS.EXPENSE_CATEGORY],
      amount: expenseData.fields?.[FIELDS.EXPENSE_AMOUNT]
    });
    
    return true;
  } catch (error) {
    // Log error in multiple parts to ensure visibility
    logger.error('=== CREATE EXPENSE ERROR START ===');
    logger.error('Error is defined:', error !== undefined);
    logger.error('Error is null:', error === null);
    logger.error('Error type:', typeof error);
    logger.error('Error constructor:', error?.constructor?.name);
    logger.error('Error message:', error?.message || 'NO MESSAGE');
    logger.error('Error statusCode:', error?.statusCode || 'NO STATUS CODE');
    logger.error('Error string:', String(error));
    logger.error('Expense ID:', expenseId);
    logger.error('Expense Data:', JSON.stringify(expenseData, null, 2));
    
    // Try to log all error properties
    if (error) {
      logger.error('Error own properties:', Object.getOwnPropertyNames(error));
      logger.error('Error keys:', Object.keys(error));
    }
    logger.error('=== CREATE EXPENSE ERROR END ===');
    throw error;
  }
}

/**
 * Get representative's outstanding debts from previous months
 * Returns all commission records with negative finalCommission
 * @param {string} representativeId - The representative's record ID
 * @param {string} currentMonth - Current month to exclude (e.g., "Octombrie")
 * @returns {Array} Array of debt records with {id, month, amount}
 */
export async function getRepresentativeDebts(representativeId, currentMonth) {
  logger.debug('Fetching representative debts', { representativeId, currentMonth });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.MONTHLY_COMMISSIONS)
        .select({
          filterByFormula: `AND(
            {${FIELDS.REPRESENTATIVE}} = "${representativeId}",
            {${FIELDS.FINAL_COMMISSION}} < 0,
            {${FIELDS.MONTH}} != "${currentMonth}"
          )`,
          maxRecords: 100,
          sort: [{ field: FIELDS.MONTH, direction: 'asc' }]
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const finalCommission = record.get(FIELDS.FINAL_COMMISSION);
            if (finalCommission && finalCommission < 0) {
              results.push({
                id: record.id,
                month: record.get(FIELDS.MONTH),
                amount: finalCommission,  // negative value
                name: record.get(FIELDS.NAME),
                representative: record.get(FIELDS.REPRESENTATIVE)
              });
            }
          });
          
          fetchNextPage();
        });
    });
    
    if (results.length > 0) {
      logger.info('Found outstanding debts for representative', {
        representativeId,
        debtCount: results.length,
        totalDebt: results.reduce((sum, d) => sum + d.amount, 0)
      });
    }
    
    return results;
  } catch (error) {
    logger.error('Failed to fetch representative debts', {
      representativeId,
      error: error.message
    });
    return [];
  }
}

/**
 * Get expense record by expense ID
 * Returns the full record including Airtable record ID
 */
export async function getExpenseByExpenseId(expenseId) {
  logger.debug('Fetching expense by expense ID', { expenseId });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.EXPENSES)
        .select({
          filterByFormula: `{${FIELDS.EXPENSE_ID}} = "${expenseId}"`,
          maxRecords: 1
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            results.push({
              id: record.id,
              expenseId: record.get(FIELDS.EXPENSE_ID),
              amount: record.get(FIELDS.EXPENSE_AMOUNT),
              description: record.get(FIELDS.EXPENSE_DESCRIPTION),
              project: record.get(FIELDS.EXPENSE_PROJECT),
              category: record.get(FIELDS.EXPENSE_CATEGORY),
              type: record.get(FIELDS.EXPENSE_TYPE)
            });
          });
          
          fetchNextPage();
        });
    });
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error('Failed to fetch expense by expense ID', {
      expenseId,
      error: error.message
    });
    return null;
  }
}

/**
 * Update existing expense record
 * Updates amount and description
 */
export async function updateExpense(recordId, updateData) {
  logger.info('Updating expense record', { 
    recordId,
    updateFields: Object.keys(updateData.fields || {})
  });
  
  try {
    await retryWithBackoff(async () => {
      await base(TABLES.EXPENSES).update([{
        id: recordId,
        fields: updateData.fields
      }]);
    });
    
    logger.info('Updated expense record', { 
      recordId,
      amount: updateData.fields?.[FIELDS.EXPENSE_AMOUNT],
      description: updateData.fields?.[FIELDS.EXPENSE_DESCRIPTION]
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to update expense', {
      recordId,
      error: error.message,
      updateData: JSON.stringify(updateData, null, 2)
    });
    throw error;
  }
}

/**
 * Batch create expense records (up to 10 per batch)
 */
export async function createExpensesBatch(expenseRecords) {
  if (!expenseRecords || expenseRecords.length === 0) {
    return;
  }
  
  logger.info('Batch creating expenses', { count: expenseRecords.length });
  
  // Airtable batch limit is 10 records
  const batches = [];
  for (let i = 0; i < expenseRecords.length; i += 10) {
    batches.push(expenseRecords.slice(i, i + 10));
  }
  
  for (const batch of batches) {
    try {
      await retryWithBackoff(async () => {
        await base(TABLES.EXPENSES).create(batch);
      });
      
      logger.debug('Created batch of expenses', { 
        count: batch.length,
        totalBatches: batches.length
      });
    } catch (error) {
      logger.error('Failed to create batch of expenses', {
        error: error.message,
        batchSize: batch.length
      });
      // Continue with next batch
    }
  }
}

/**
 * Get representative by name
 * @param {string} name - Representative name
 * @returns {Object|null} Representative record or null
 */
export async function getRepresentativeByExactName(name) {
  logger.debug('Fetching representative by exact name', { name });
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.REPRESENTATIVES)
        .select({
          filterByFormula: `{${FIELDS.REP_NAME}} = "${name}"`,
          maxRecords: 1
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            results.push({
              id: record.id,
              name: record.get(FIELDS.REP_NAME),
              email: record.get(FIELDS.REP_EMAIL),
              cif: record.get(FIELDS.REP_CIF),
              role: record.get(FIELDS.REP_ROLE)
            });
          });
          fetchNextPage();
        });
    });
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error('Failed to fetch representative by exact name', {
      name,
      error: error.message
    });
    return null;
  }
}

/**
 * Get monthly commission record by representative and month
 * @param {string} representativeId - The representative's record ID
 * @param {string} month - Month name (e.g., "Octombrie")
 * @returns {Object|null} Monthly commission record or null
 */
export async function getMonthlyCommissionByRepAndMonth(representativeId, month) {
  const formula = `AND(
            FIND("${representativeId}", ARRAYJOIN({${FIELDS.REPRESENTATIVE}})) > 0,
            {${FIELDS.MONTH}} = "${month}"
          )`;
  
  logger.info(`🔍 SEARCH: repId="${representativeId}" month="${month}"`);
  
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.MONTHLY_COMMISSIONS)
        .select({
          filterByFormula: formula,
          maxRecords: 1
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const existingRec = {
              id: record.id,
              name: record.get(FIELDS.NAME),
              representative: record.get(FIELDS.REPRESENTATIVE),
              month: record.get(FIELDS.MONTH),
              sales: record.get(FIELDS.SALES) || [],
              finalCommission: record.get(FIELDS.FINAL_COMMISSION),
              role: record.get(FIELDS.ROLE)
            };
            
            logger.info(`✅ FOUND: recordId="${existingRec.id}" repIds="${existingRec.representative}" month="${existingRec.month}"`);
            
            results.push(existingRec);
          });
          fetchNextPage();
        });
    });
    
    if (results.length === 0) {
      logger.warn(`❌ NOT FOUND: repId="${representativeId}" month="${month}"`);
    }
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error('Failed to fetch monthly commission by rep and month', {
      representativeId,
      month,
      error: error.message
    });
    return null;
  }
}

/**
 * Create monthly commission record in "Comisioane Lunare" table
 * @param {Object} commissionData - Commission data with fields
 * @returns {Object|null} Created record or null
 */
export async function createMonthlyCommission(commissionData) {
  const repId = commissionData.fields?.[FIELDS.REPRESENTATIVE]?.[0] || 'Unknown';
  const month = commissionData.fields?.[FIELDS.MONTH];
  const salesCount = commissionData.fields?.[FIELDS.SALES]?.length || 0;
  
  logger.warn(`⚠️  CREATE: repId="${repId}" month="${month}" sales=${salesCount}`);
  
  try {
    let createdRecord = null;
    
    await retryWithBackoff(async () => {
      const records = await base(TABLES.MONTHLY_COMMISSIONS).create([commissionData]);
      createdRecord = records[0];
    });
    
    logger.info(`✅ CREATED: recordId="${createdRecord?.id}"`);
    
    return createdRecord ? {
      id: createdRecord.id,
      name: createdRecord.get(FIELDS.NAME),
      representative: createdRecord.get(FIELDS.REPRESENTATIVE),
      month: createdRecord.get(FIELDS.MONTH),
      sales: createdRecord.get(FIELDS.SALES) || []
    } : null;
  } catch (error) {
    logger.error('Failed to create monthly commission record', {
      representative: repName,
      month,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Update monthly commission record in "Comisioane Lunare" table
 * @param {string} recordId - Airtable record ID
 * @param {Object} updateData - Update data with fields
 * @returns {boolean} Success status
 */
export async function updateMonthlyCommission(recordId, updateData) {
  const salesCount = updateData.fields?.[FIELDS.SALES]?.length;
  logger.info(`🔄 UPDATE: recordId="${recordId}" sales=${salesCount}`);
  
  try {
    await retryWithBackoff(async () => {
      await base(TABLES.MONTHLY_COMMISSIONS).update([{
        id: recordId,
        fields: updateData.fields
      }]);
    });
    
    logger.info(`✅ UPDATED: recordId="${recordId}"`);
    
    return true;
  } catch (error) {
    logger.error('Failed to update monthly commission record', {
      recordId,
      error: error.message,
      updateData: JSON.stringify(updateData, null, 2)
    });
    throw error;
  }
}

