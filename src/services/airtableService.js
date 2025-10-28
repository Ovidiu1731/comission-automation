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
async function retryWithBackoff(fn, maxAttempts = 3) {
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
              results.push({
                id: record.id,
                project: record.get(FIELDS.PROJECT),
                amountWithoutVat: record.get(FIELDS.AMOUNT_WITHOUT_VAT),
                totalAmount: record.get(FIELDS.TOTAL_AMOUNT),
                utmCampaign: record.get(FIELDS.UTM_CAMPAIGN),
                saleDate: record.get(FIELDS.SALE_DATE),
                monthYear: record.get(FIELDS.SALE_MONTH)
              });
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
        .eachPage((records) => {
          records.forEach(record => {
            results.push({
              id: record.id,
              name: record.get(FIELDS.REP_NAME),
              email: record.get(FIELDS.REP_EMAIL),
              cif: record.get(FIELDS.REP_CIF),
              role: record.get(FIELDS.REP_ROLE)
            });
          });
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

