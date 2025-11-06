/**
 * Stripe Fee Processing
 * 
 * Calculates and creates expense records for Stripe payment processing fees.
 * - Fee: 2% of "Suma Totală" (amount WITH VAT)
 * - Only for sales with "link de plata" payment method
 * - Grouped by project
 */
import { base } from '../config/airtable.js';
import {
  getExpenseByExpenseId,
  createExpense,
  updateExpense,
  getAllMonthYearsFromSales
} from './airtableService.js';
import {
  TABLES,
  FIELDS,
  EXPENSE_CATEGORIES,
  VAT_INCLUDED,
  SOURCE,
  STRIPE,
  getCurrentRomanianMonth,
  getCurrentYear,
  getCurrentMonthYearString
} from '../config/constants.js';
import {
  isValidExpenseAmount,
  isValidProject
} from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Format number with thousand separators
 * Example: 125184 -> "125,184"
 */
function formatNumberWithCommas(number) {
  return Math.round(number).toLocaleString('en-US');
}

/**
 * Helper function to detect Stripe payments
 * Handles case-insensitive matching
 */
function isStripePayment(paymentMethod) {
  if (!paymentMethod) return false;
  
  // Convert to lowercase and trim spaces
  const normalized = paymentMethod
    .toLowerCase()
    .trim();
  
  // Check if it contains "link" (any variation)
  return normalized.includes('link');
}

/**
 * Get all Stripe payments for a specific month
 */
async function getStripePayments(monthYear) {
  logger.info('Fetching Stripe payments', { monthYear });
  
  try {
    const results = [];
    
    await base(TABLES.SALES)
      .select({
        filterByFormula: `{${FIELDS.SALE_MONTH}} = "${monthYear}"`,
        maxRecords: 10000
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach(record => {
          const paymentMethod = record.get(FIELDS.PAYMENT_METHOD);
          const totalAmount = record.get(FIELDS.TOTAL_AMOUNT);
          const project = record.get(FIELDS.PROJECT);
          
          // Check if this is a Stripe payment
          if (isStripePayment(paymentMethod) && totalAmount && totalAmount > 0) {
            results.push({
              id: record.id,
              project: project,
              totalAmount: totalAmount,
              paymentMethod: paymentMethod
            });
            
            logger.debug('Found Stripe payment', {
              id: record.id,
              project,
              amount: totalAmount,
              paymentMethod
            });
          }
        });
        fetchNextPage();
      });
    
    logger.info(`Fetched ${results.length} Stripe payments`, { monthYear });
    return results;
  } catch (error) {
    logger.error('Failed to fetch Stripe payments', {
      error: error.message,
      monthYear
    });
    throw error;
  }
}

/**
 * Process Stripe fee expenses
 * @param {string} targetMonthYear - Optional. Format: "Luna YYYY" (e.g., "Octombrie 2025"). If provided, only processes that month.
 */
export async function processStripeFees(targetMonthYear = null) {
  if (targetMonthYear) {
    logger.info(`=== Processing Stripe Fees for: ${targetMonthYear} ===`);
  } else {
    logger.info('=== Processing Stripe Fees for ALL months ===');
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
        processed: 0,
        skipped: 0,
        created: 0,
        updated: 0,
        errors: 0,
        totalFees: 0,
        totalProcessed: 0
      };
    }
    
    logger.info(`Processing Stripe fees for ${monthYears.length} month-years: ${monthYears.join(', ')}`);
    
    let totalStats = {
      processed: 0,
      skipped: 0,
      created: 0,
      updated: 0,
      errors: 0,
      totalFees: 0,
      totalProcessed: 0
    };
    
    for (const monthYear of monthYears) {
      logger.info(`\n========== Processing Stripe fees for: ${monthYear} ==========`);
      const result = await processStripeFeesForMonthYear(monthYear);
      totalStats.processed += result.processed;
      totalStats.skipped += result.skipped;
      totalStats.created += result.created;
      totalStats.updated += result.updated;
      totalStats.errors += result.errors;
      totalStats.totalFees += result.totalFees;
      totalStats.totalProcessed += result.totalProcessed;
    }
    
    logger.info('Completed Stripe fee processing', { targetMonthYear, ...totalStats });
    return totalStats;
  } catch (error) {
    logger.error('Failed to process Stripe fees', {
      error: error.message,
      stack: error.stack,
      targetMonthYear
    });
    throw error;
  }
}

/**
 * Process Stripe fees for a specific month-year
 */
async function processStripeFeesForMonthYear(monthYear) {
  // Parse month-year (format: "Luna YYYY")
  const parts = monthYear.split(' ');
  const month = parts[0];
  const year = parseInt(parts[1]);
  
  logger.info('Processing Stripe fees for month-year', { monthYear, month, year });
  
  const stats = {
    processed: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    errors: 0,
    totalFees: 0,
    totalProcessed: 0
  };
  
  try {
    // Get all Stripe payments for this month-year
    const payments = await getStripePayments(monthYear);
    
    if (payments.length === 0) {
      logger.info('No Stripe payments found for month-year', { monthYear });
      return stats;
    }
    
    logger.info(`Found ${payments.length} Stripe payments`);
    
    // Calculate fees and group by project
    const feesByProject = {};
    
    for (const payment of payments) {
      stats.processed++;
      
      // Validate project
      if (!isValidProject(payment.project)) {
        logger.warn('Stripe payment has invalid or missing project, skipping', {
          paymentId: payment.id,
          project: payment.project
        });
        stats.skipped++;
        continue;
      }
      
      // Validate amount
      if (!payment.totalAmount || payment.totalAmount <= 0) {
        logger.warn('Stripe payment has invalid amount, skipping', {
          paymentId: payment.id,
          amount: payment.totalAmount
        });
        stats.skipped++;
        continue;
      }
      
      // Calculate Stripe fee (2% of Suma Totală)
      const fee = payment.totalAmount * STRIPE.feeRate;
      
      logger.debug('Calculated Stripe fee', {
        paymentId: payment.id,
        project: payment.project,
        totalAmount: payment.totalAmount,
        fee: fee.toFixed(2)
      });
      
      // Group by project
      if (!feesByProject[payment.project]) {
        feesByProject[payment.project] = {
          project: payment.project,
          paymentCount: 0,
          totalProcessed: 0,
          totalFees: 0,
          paymentIds: []
        };
      }
      
      feesByProject[payment.project].paymentCount++;
      feesByProject[payment.project].totalProcessed += payment.totalAmount;
      feesByProject[payment.project].totalFees += fee;
      feesByProject[payment.project].paymentIds.push(payment.id);
      
      stats.totalFees += fee;
      stats.totalProcessed += payment.totalAmount;
    }
    
    logger.info('Stripe fee calculation complete', {
      paymentsProcessed: stats.processed,
      projectsWithFees: Object.keys(feesByProject).length,
      totalFeesCalculated: stats.totalFees.toFixed(2),
      totalAmountProcessed: stats.totalProcessed.toFixed(2)
    });
    
    // Log breakdown by project
    for (const [project, data] of Object.entries(feesByProject)) {
      logger.info(`Project: ${project}`, {
        payments: data.paymentCount,
        processed: data.totalProcessed.toFixed(2) + ' RON',
        fees: data.totalFees.toFixed(2) + ' RON'
      });
    }
    
    // Create/update expense records
    const groupedData = Object.values(feesByProject);
    logger.info(`Creating/updating ${groupedData.length} Stripe expense records`);
    
    for (const group of groupedData) {
      try {
        const result = await createOrUpdateStripeExpense(group, month, year);
        if (result === 'created') {
          stats.created++;
        } else if (result === 'updated') {
          stats.updated++;
        }
      } catch (error) {
        logger.error('Failed to create/update Stripe expense', {
          error: error.message,
          project: group.project
        });
        stats.errors++;
      }
    }
    
    logger.info('=== Stripe Fee Processing Complete ===', {
      processed: stats.processed,
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.errors,
      totalFees: stats.totalFees.toFixed(2) + ' RON'
    });
    
    return stats;
  } catch (error) {
    logger.error('Stripe fee processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Create or update Stripe expense record
 */
async function createOrUpdateStripeExpense(group, month, year) {
  const { project, paymentCount, totalProcessed, totalFees, paymentIds } = group;
  
  // Round fee to 2 decimals
  const roundedFee = Math.round(totalFees * 100) / 100;
  
  // Validate fee amount
  if (!isValidExpenseAmount(roundedFee)) {
    logger.warn('Invalid Stripe fee amount, skipping', {
      project,
      fee: roundedFee
    });
    return null;
  }
  
  // Generate unique expense ID: stripe_{project}_{month}
  const expenseId = `stripe_${project}_${month}`.replace(/\s+/g, '_');
  
  // Format total processed amount for description with thousand separators
  const formattedTotalProcessed = formatNumberWithCommas(totalProcessed);
  
  // Prepare expense data
  const expenseFields = {
    [FIELDS.EXPENSE_DESCRIPTION]: `Comision procesare plati Stripe - ${project} (${paymentCount} tranzactii, ${formattedTotalProcessed} RON procesate)`,
    [FIELDS.EXPENSE_PROJECT]: project,
    [FIELDS.EXPENSE_CATEGORY]: EXPENSE_CATEGORIES.TAXE_IMPOZITE,
    [FIELDS.EXPENSE_AMOUNT]: roundedFee,
    [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
    [FIELDS.EXPENSE_MONTH]: month,
    [FIELDS.EXPENSE_YEAR]: year,
    [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
    [FIELDS.EXPENSE_ID]: expenseId,
    [FIELDS.EXPENSE_ASSOCIATED_SALES]: paymentIds
  };
  
  try {
    // Check if expense already exists
    const existingExpense = await getExpenseByExpenseId(expenseId);
    
    if (existingExpense) {
      logger.info('Updating existing Stripe expense', {
        expenseId,
        project,
        oldAmount: existingExpense.amount,
        newAmount: roundedFee,
        paymentCount
      });
      
      await updateExpense(existingExpense.id, {
        fields: expenseFields
      });
      
      logger.info('Stripe expense updated successfully', {
        expenseId,
        project,
        amount: roundedFee
      });
      
      return 'updated';
    } else {
      logger.info('Creating new Stripe expense', {
        expenseId,
        project,
        amount: roundedFee,
        paymentCount,
        totalProcessed
      });
      
      await createExpense({
        fields: expenseFields
      });
      
      logger.info('Stripe expense created successfully', {
        expenseId,
        project,
        amount: roundedFee
      });
      
      return 'created';
    }
  } catch (error) {
    logger.error('Failed to create/update Stripe expense', {
      error: error.message,
      expenseId,
      project
    });
    throw error;
  }
}

// Export helper function for testing
export { isStripePayment };

