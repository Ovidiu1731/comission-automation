/**
 * Copywriting Commission Processing
 * 
 * Processes commissions for copywriters based on Utm Campaign in sales records.
 * Currently handles Diana Nastase with a flat 5% commission rate.
 */
import {
  getSalesByUtmCampaign,
  getExpenseByExpenseId,
  createExpense,
  updateExpense,
  getRepresentativeByExactName,
  getMonthlyCommissionByRepAndMonth,
  createMonthlyCommission,
  updateMonthlyCommission,
  getAllMonthYearsFromSales
} from './airtableService.js';
import {
  FIELDS,
  EXPENSE_CATEGORIES,
  VAT_INCLUDED,
  SOURCE,
  COPYWRITING,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import {
  isValidExpenseAmount,
  isValidProject
} from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Normalize string for name matching
 * Removes spaces, diacritics, converts to lowercase
 */
function normalizeString(str) {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/ă/g, 'a')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/ș/g, 's')
    .replace(/ț/g, 't')
    .trim();
}

/**
 * Check if a sale belongs to Diana Nastase based on Utm Campaign
 * @param {string} utmCampaign - The Utm Campaign value from the sale
 * @returns {boolean} True if this is Diana's sale
 */
function isDianaNastaseSale(utmCampaign) {
  if (!utmCampaign) return false;
  
  const normalized = normalizeString(utmCampaign);
  const target = normalizeString(COPYWRITING.copywriter.utmIdentifier);
  
  return normalized === target || normalized.includes(target);
}

/**
 * Format number with thousands separator
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumberWithCommas(num) {
  return num.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calculate progressive commission based on tiered rates
 * @param {number} totalSalesRON - Total sales value in RON
 * @returns {number} Total commission in RON
 */
function calculateProgressiveCommission(totalSalesRON) {
  // Convert RON to EUR for threshold checking
  const totalSalesEUR = totalSalesRON / COPYWRITING.eurRonRate;
  
  logger.debug('Calculating progressive commission', {
    totalSalesRON,
    totalSalesEUR,
    eurRonRate: COPYWRITING.eurRonRate
  });
  
  let totalCommission = 0;
  let remainingAmount = totalSalesEUR;
  let previousThreshold = 0;
  
  for (const tier of COPYWRITING.tiers) {
    const tierMax = tier.max;
    const tierRate = tier.rate;
    
    if (remainingAmount <= 0) break;
    
    // Calculate amount in this tier
    const tierAmount = Math.min(remainingAmount, tierMax - previousThreshold);
    
    if (tierAmount > 0) {
      // Commission for this tier (in EUR)
      const tierCommissionEUR = tierAmount * tierRate;
      
      logger.debug('Tier calculation', {
        tierMax,
        tierRate: `${(tierRate * 100).toFixed(1)}%`,
        tierAmountEUR: tierAmount.toFixed(2),
        tierCommissionEUR: tierCommissionEUR.toFixed(2)
      });
      
      totalCommission += tierCommissionEUR;
      remainingAmount -= tierAmount;
    }
    
    previousThreshold = tierMax;
  }
  
  // Convert commission back to RON
  const totalCommissionRON = totalCommission * COPYWRITING.eurRonRate;
  
  logger.info('Progressive commission calculated', {
    totalSalesEUR: totalSalesEUR.toFixed(2),
    totalCommissionEUR: totalCommission.toFixed(2),
    totalCommissionRON: totalCommissionRON.toFixed(2),
    effectiveRate: `${((totalCommission / totalSalesEUR) * 100).toFixed(2)}%`
  });
  
  return totalCommissionRON;
}

/**
 * Process copywriting commissions for ALL months
 */
export async function processCopywritingCommissions() {
  logger.info('=== Processing Copywriting Commissions for ALL months ===');
  
  try {
    const monthYears = await getAllMonthYearsFromSales();
    
    if (monthYears.length === 0) {
      return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        totalCommission: 0,
        totalSalesValue: 0
      };
    }
    
    logger.info(`Processing copywriting for ${monthYears.length} month-years: ${monthYears.join(', ')}`);
    
    let totalStats = {
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalCommission: 0,
      totalSalesValue: 0
    };
    
    for (const monthYear of monthYears) {
      logger.info(`\n========== Processing copywriting for: ${monthYear} ==========`);
      const result = await processCopywritingCommissionsForMonthYear(monthYear);
      totalStats.processed += result.processed;
      totalStats.created += result.created;
      totalStats.updated += result.updated;
      totalStats.skipped += result.skipped;
      totalStats.errors += result.errors;
      totalStats.totalCommission += result.totalCommission;
      totalStats.totalSalesValue += result.totalSalesValue;
    }
    
    logger.info('Completed copywriting processing for all months', totalStats);
    return totalStats;
  } catch (error) {
    logger.error('Failed to process copywriting commissions', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process copywriting commissions for a specific month-year
 */
async function processCopywritingCommissionsForMonthYear(monthYear) {
  // Parse month-year (format: "Luna YYYY")
  const parts = monthYear.split(' ');
  const month = parts[0];
  const year = parseInt(parts[1]);
  
  logger.info('Processing copywriting for month-year', { 
    monthYear, 
    month, 
    year,
    copywriter: COPYWRITING.copywriter.name,
    tiers: COPYWRITING.tiers
  });
  
  try {
    // Get all sales for this month-year
    const allSales = await getSalesByUtmCampaign(monthYear);
    
    if (allSales.length === 0) {
      logger.info('No sales found for current month', { month, year });
      return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        totalCommission: 0,
        totalSalesValue: 0
      };
    }
    
    // Filter for Diana's sales
    const dianaSales = allSales.filter(sale => {
      const utmCampaign = sale[FIELDS.UTM_CAMPAIGN];
      const isDiana = isDianaNastaseSale(utmCampaign);
      
      if (isDiana) {
        logger.debug('Found Diana Nastase sale', {
          saleId: sale.id,
          utmCampaign,
          client: sale[FIELDS.CLIENT_NAME],
          project: sale[FIELDS.PROJECT],
          amount: sale[FIELDS.AMOUNT_WITHOUT_VAT]
        });
      }
      
      return isDiana;
    });
    
    if (dianaSales.length === 0) {
      logger.info('No copywriting sales found for Diana Nastase', { month, year });
      return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        totalCommission: 0,
        totalSalesValue: 0
      };
    }
    
    logger.info(`Found ${dianaSales.length} copywriting sales for Diana Nastase in ${monthYear}`);
    
    // First, validate and collect all sales
    const validSales = [];
    let totalSkipped = 0;
    
    for (const sale of dianaSales) {
      const amountWithoutVat = sale[FIELDS.AMOUNT_WITHOUT_VAT];
      const project = sale[FIELDS.PROJECT];
      
      // Validate amount
      if (amountWithoutVat === null || amountWithoutVat === undefined) {
        logger.warn('Sale missing Total După TVA, skipping', {
          saleId: sale.id,
          client: sale[FIELDS.CLIENT_NAME]
        });
        totalSkipped++;
        continue;
      }
      
      // Skip zero or negative amounts
      if (amountWithoutVat <= 0) {
        logger.warn('Sale has zero or negative amount, skipping', {
          saleId: sale.id,
          amount: amountWithoutVat
        });
        totalSkipped++;
        continue;
      }
      
      // Validate project
      if (!project) {
        logger.warn('Sale missing project, skipping', {
          saleId: sale.id,
          client: sale[FIELDS.CLIENT_NAME]
        });
        totalSkipped++;
        continue;
      }
      
      validSales.push({
        ...sale,
        amountWithoutVat,
        project
      });
    }
    
    if (validSales.length === 0) {
      logger.info('No valid copywriting sales found after validation');
      return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: totalSkipped,
        errors: 0,
        totalCommission: 0,
        totalSalesValue: 0
      };
    }
    
    // Calculate total sales value across ALL projects (for progressive rate calculation)
    const totalSalesValueRON = validSales.reduce((sum, sale) => sum + sale.amountWithoutVat, 0);
    
    // Calculate TOTAL commission using progressive tiers
    const totalCommissionRON = calculateProgressiveCommission(totalSalesValueRON);
    
    // Now distribute this commission proportionally across projects
    const commissionsByProject = {};
    
    for (const sale of validSales) {
      const project = sale.project;
      
      // Initialize project group if needed
      if (!commissionsByProject[project]) {
        commissionsByProject[project] = {
          project,
          projectSalesValue: 0,
          salesCount: 0,
          saleIds: []
        };
      }
      
      // Add to project totals
      commissionsByProject[project].projectSalesValue += sale.amountWithoutVat;
      commissionsByProject[project].salesCount++;
      commissionsByProject[project].saleIds.push(sale.id);
    }
    
    // Distribute total commission proportionally to projects
    for (const [project, data] of Object.entries(commissionsByProject)) {
      const proportion = data.projectSalesValue / totalSalesValueRON;
      data.projectCommission = totalCommissionRON * proportion;
      
      logger.debug('Project commission allocation', {
        project,
        projectSalesValue: data.projectSalesValue.toFixed(2),
        proportion: `${(proportion * 100).toFixed(2)}%`,
        projectCommission: data.projectCommission.toFixed(2)
      });
    }
    
    const projectCount = Object.keys(commissionsByProject).length;
    logger.info(`Grouped into ${projectCount} projects`, { projectCount });
    
    // Create/update monthly commission record for copywriter
    logger.info('Creating/updating monthly commission record for copywriter');
    
    try {
      // Collect all sale IDs across all projects
      const allSaleIds = validSales.map(sale => sale.id);
      
      await createOrUpdateCopywriterMonthlyCommission(
        COPYWRITING.copywriter.name,
        {
          totalCommission: totalCommissionRON,
          salesCount: validSales.length,
          saleIds: allSaleIds
        },
        month,
        year
      );
    } catch (error) {
      logger.error('Failed to create/update copywriter monthly commission', {
        copywriterName: COPYWRITING.copywriter.name,
        error: error.message,
        stack: error.stack
      });
    }
    
    // Create or update expenses
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const [project, data] of Object.entries(commissionsByProject)) {
      try {
        logger.info(`Processing copywriting expense for project: ${project}`, {
          salesCount: data.salesCount,
          projectSalesValue: data.projectSalesValue.toFixed(2),
          projectCommission: data.projectCommission.toFixed(2)
        });
        
        const result = await createOrUpdateCopywritingExpense(
          data,
          totalSalesValueRON,
          totalCommissionRON,
          month,
          year
        );
        
        if (result.created) created++;
        if (result.updated) updated++;
        
      } catch (error) {
        logger.error('Failed to create/update copywriting expense', {
          project,
          error: error.message,
          stack: error.stack
        });
        errors++;
      }
    }
    
    logger.info('=== Copywriting Commission Processing Complete ===', {
      processed: validSales.length,
      skipped: totalSkipped,
      created,
      updated,
      errors,
      totalSales: dianaSales.length,
      projectCount,
      totalCommission: totalCommissionRON.toFixed(2),
      totalSalesValue: totalSalesValueRON.toFixed(2),
      totalSalesEUR: (totalSalesValueRON / COPYWRITING.eurRonRate).toFixed(2)
    });
    
    return {
      processed: validSales.length,
      created,
      updated,
      skipped: totalSkipped,
      errors,
      totalCommission: totalCommissionRON,
      totalSalesValue: totalSalesValueRON
    };
    
  } catch (error) {
    logger.error('Failed to process copywriting commissions', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Create or update Copywriter monthly commission record in "Comisioane Lunare" table
 */
async function createOrUpdateCopywriterMonthlyCommission(copywriterName, summary, month, year) {
  logger.info('Creating/updating monthly commission for copywriter', {
    copywriterName,
    totalCommission: summary.totalCommission.toFixed(2),
    salesCount: summary.salesCount
  });
  
  try {
    // Get representative record for this copywriter
    const representative = await getRepresentativeByExactName(copywriterName);
    
    if (!representative) {
      logger.warn('Copywriter not found in Representatives table, skipping monthly commission record', {
        copywriterName
      });
      return null;
    }
    
    logger.info('Found copywriter representative', {
      name: representative.name,
      id: representative.id,
      role: representative.role
    });
    
    // Check if monthly commission record already exists
    // Search by NAME (not ID) because ARRAYJOIN on linked records returns names
    const existingCommission = await getMonthlyCommissionByRepAndMonth(
      representative.name,
      month
    );
    
    const saleIds = summary.saleIds;
    
    if (existingCommission) {
      // Update existing record
      logger.info('Updating existing monthly commission record for copywriter', {
        recordId: existingCommission.id,
        copywriterName,
        oldSalesCount: existingCommission.sales?.length || 0,
        newSalesCount: saleIds.length
      });
      
      await updateMonthlyCommission(existingCommission.id, {
        fields: {
          [FIELDS.SALES]: saleIds
        }
      });
      
      logger.info('✅ Updated monthly commission record for copywriter', {
        recordId: existingCommission.id,
        copywriterName,
        month,
        salesCount: saleIds.length
      });
    } else {
      // Create new record
      logger.info('Creating new monthly commission record for copywriter', {
        copywriterName,
        month,
        salesCount: saleIds.length
      });
      
      await createMonthlyCommission({
        fields: {
          [FIELDS.REPRESENTATIVE]: [representative.id],
          [FIELDS.MONTH]: month,
          [FIELDS.SALES]: saleIds
        }
      });
      
      logger.info('✅ Created monthly commission record for copywriter', {
        copywriterName,
        month,
        salesCount: saleIds.length
      });
    }
  } catch (error) {
    logger.error('Failed to create/update copywriter monthly commission', {
      copywriterName,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Create or update a copywriting expense record
 */
async function createOrUpdateCopywritingExpense(data, totalSalesValueRON, totalCommissionRON, month, year) {
  const { project, projectCommission, projectSalesValue, salesCount, saleIds } = data;
  
  // Generate unique expense ID
  const expenseId = `copywriting_DianaNastase_${project}_${month}`;
  
  // Check if expense already exists
  const existingExpense = await getExpenseByExpenseId(expenseId);
  
  const expenseFields = {
    [FIELDS.EXPENSE_DESCRIPTION]: `Copywriter: Diana Nastase`,
    [FIELDS.EXPENSE_PROJECT]: project,
    [FIELDS.EXPENSE_CATEGORY]: COPYWRITING.category,
    [FIELDS.EXPENSE_AMOUNT]: projectCommission,
    [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
    [FIELDS.EXPENSE_MONTH]: month,
    [FIELDS.EXPENSE_YEAR]: year,
    [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
    [FIELDS.EXPENSE_ID]: expenseId,
    [FIELDS.EXPENSE_ASSOCIATED_SALES]: saleIds
  };
  
  if (existingExpense) {
    // Update existing expense
    logger.info('Updating existing copywriting expense', {
      expenseId,
      oldAmount: existingExpense[FIELDS.EXPENSE_AMOUNT],
      newAmount: projectCommission,
      salesCount
    });
    
    await updateExpense(existingExpense.id, {
      fields: expenseFields
    });
    
    logger.info('Copywriting expense updated successfully', {
      expenseId,
      project,
      amount: projectCommission,
      salesCount
    });
    
    return { updated: true, created: false };
  } else {
    // Create new expense
    logger.info('Creating new copywriting expense', {
      expenseId,
      project,
      amount: projectCommission,
      salesCount
    });
    
    await createExpense({
      fields: expenseFields
    });
    
    logger.info('Copywriting expense created successfully', {
      expenseId,
      project,
      amount: projectCommission,
      salesCount
    });
    
    return { created: true, updated: false };
  }
}

