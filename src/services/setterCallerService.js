/**
 * Setter/Caller Commission Processing
 * 
 * Processes 5% commissions for lead generators (people named in Utm Campaign).
 * Filters valid CamelCase names and looks up roles from Reprezentanți table.
 */
import {
  getSetterCallerSales,
  getRepresentativeByName,
  expenseExists,
  createExpense
} from './airtableService.js';
import {
  FIELDS,
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES,
  VAT_INCLUDED,
  SOURCE,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import {
  isValidSetterCallerName,
  extractSetterCallerName,
  isValidExpenseAmount,
  isValidProject
} from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Process all Setter/Caller commissions for current month
 */
export async function processSetterCallerCommissions() {
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  const monthYear = `${month} ${year}`;
  
  logger.info('Starting Setter/Caller commission processing', { monthYear });
  
  try {
    // Get all sales with Utm Campaign for current month
    const sales = await getSetterCallerSales(monthYear);
    
    if (sales.length === 0) {
      logger.info('No Setter/Caller sales found for current month', { monthYear });
      return {
        processed: 0,
        created: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    // Group sales by setter/caller name and project
    const groupedSales = groupSalesBySetterCallerAndProject(sales);
    
    logger.info('Grouped Setter/Caller sales', {
      uniqueGroupings: Object.keys(groupedSales).length,
      totalSales: sales.length
    });
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    logger.info('=== STARTING TO PROCESS GROUPS ===');
    logger.info(`Will process ${Object.keys(groupedSales).length} groups`);
    
    // Process each group
    let groupIndex = 0;
    for (const [key, group] of Object.entries(groupedSales)) {
      groupIndex++;
      logger.info(`[${groupIndex}/${Object.keys(groupedSales).length}] Processing group: ${key}`);
      
      try {
        const [name, project] = key.split('||');
        logger.info(`  Name: ${name}, Project: ${project}, Commission: ${group.totalCommission}`);
        
        const result = await processSetterCallerGroup(name, project, group, month, year);
        
        logger.info(`  Result: created=${result.created}, skipped=${result.skipped}`);
        created += result.created;
        skipped += result.skipped;
      } catch (error) {
        logger.error(`  ERROR processing group ${key}:`, {
          error: error.message,
          stack: error.stack
        });
        errors++;
      }
    }
    
    logger.info('=== FINISHED PROCESSING ALL GROUPS ===');
    
    logger.info('Completed Setter/Caller commission processing', {
      totalGroupings: Object.keys(groupedSales).length,
      created,
      skipped,
      errors
    });
    
    return {
      processed: Object.keys(groupedSales).length,
      created,
      skipped,
      errors
    };
  } catch (error) {
    logger.error('Setter/Caller commission processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process a group of sales for a specific setter/caller and project
 */
async function processSetterCallerGroup(name, project, group, month, year) {
  const { totalCommission, salesCount } = group;
  
  logger.info(`>>> processSetterCallerGroup called: ${name} - ${project}`);
  
  // Validate project
  if (!isValidProject(project)) {
    logger.warn('Invalid project name, skipping', {
      name,
      project
    });
    return { created: 0, skipped: 1 };
  }
  
  // Validate commission amount
  if (!isValidExpenseAmount(totalCommission)) {
    logger.warn('Invalid commission amount, skipping', {
      name,
      project,
      totalCommission
    });
    return { created: 0, skipped: 1 };
  }
  
  // Round to 2 decimal places
  const roundedCommission = Math.round(totalCommission * 100) / 100;
  
  // Look up role from Reprezentanți table
  const role = await lookupSetterCallerRole(name);
  
  // Determine expense category based on role
  let category;
  if (role === 'Caller') {
    category = EXPENSE_CATEGORIES.CALLER;
  } else if (role === 'Setter') {
    category = EXPENSE_CATEGORIES.SETTER;
  } else {
    // Default to Setter if role not found or unknown
    logger.warn('Unknown role, defaulting to Setter', {
      name,
      role
    });
    category = EXPENSE_CATEGORIES.SETTER;
  }
  
  // Generate unique expense ID
  const expenseId = `setter_caller_${name}_${project}_${month.toLowerCase()}`;
  
  // Check if expense already exists
  const exists = await expenseExists(expenseId);
  if (exists) {
    logger.debug('Expense already exists, skipping', {
      expenseId,
      name,
      project,
      month
    });
    return { created: 0, skipped: 1 };
  }
  
  // Create expense record
  try {
    const expenseData = {
      fields: {
        [FIELDS.EXPENSE_DESCRIPTION]: `${name} - ${month}`,
        [FIELDS.EXPENSE_TYPE]: EXPENSE_TYPES.COMMISSIONS,
        [FIELDS.EXPENSE_PROJECT]: project,
        [FIELDS.EXPENSE_CATEGORY]: category,
        [FIELDS.EXPENSE_AMOUNT]: roundedCommission,
        [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
        [FIELDS.EXPENSE_DATE]: new Date().toISOString().split('T')[0],
        [FIELDS.EXPENSE_MONTH]: month,
        [FIELDS.EXPENSE_YEAR]: year,
        [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
        [FIELDS.EXPENSE_ID]: expenseId
      }
    };
    
    await createExpense(expenseData);
    
    logger.info('Created Setter/Caller expense', {
      expenseId,
      name,
      project,
      category,
      totalCommission: roundedCommission,
      salesCount
    });
    
    return { created: 1, skipped: 0 };
  } catch (error) {
    logger.error('Failed to create expense for Setter/Caller', {
      expenseId,
      name,
      project,
      error: error.message
    });
    return { created: 0, skipped: 1 };
  }
}

/**
 * Look up Setter/Caller role from Reprezentanți table
 * Returns 'Setter' as default if not found
 */
async function lookupSetterCallerRole(name) {
  logger.debug('Looking up role for Setter/Caller', { name });
  
  try {
    const representative = await getRepresentativeByName(name);
    
    if (!representative) {
      logger.warn('Representative not found, defaulting to Setter', { name });
      return 'Setter';
    }
    
    const role = representative.role;
    logger.debug('Found role for Setter/Caller', { name, role });
    
    return role || 'Setter';
  } catch (error) {
    logger.error('Failed to look up role, defaulting to Setter', {
      name,
      error: error.message
    });
    return 'Setter';
  }
}

/**
 * Group sales by Setter/Caller name and project
 * Filters out invalid names
 */
function groupSalesBySetterCallerAndProject(sales) {
  const groups = {};
  let skippedCount = 0;
  
  for (const sale of sales) {
    const utmCampaign = sale.utmCampaign;
    const project = sale.project;
    const setterCallerCommission = sale.setterCallerCommission;
    
    // Validate project
    if (!isValidProject(project)) {
      logger.debug('Sale missing project, skipping', { saleId: sale.id });
      skippedCount++;
      continue;
    }
    
    // Validate commission amount
    if (!setterCallerCommission || setterCallerCommission <= 0) {
      logger.debug('Sale has zero Setter/Caller commission, skipping', {
        saleId: sale.id
      });
      skippedCount++;
      continue;
    }
    
    // Extract valid name from Utm Campaign
    const name = extractSetterCallerName(utmCampaign);
    
    if (!name) {
      logger.warn(`SKIPPED - No valid name found in Utm Campaign: "${utmCampaign}"`);
      skippedCount++;
      continue;
    }
    
    // Validate name format
    if (!isValidSetterCallerName(name)) {
      logger.warn(`SKIPPED - Name "${name}" does not match regex /^[A-Z][a-z]+[A-Z][a-z]+$/`);
      skippedCount++;
      continue;
    }
    
    logger.info(`VALID - Extracted name "${name}" from Utm Campaign "${utmCampaign}"`);
    
    // Create group key: name||project
    const key = `${name}||${project}`;
    
    if (!groups[key]) {
      groups[key] = {
        name,
        project,
        totalCommission: 0,
        salesCount: 0,
        sales: []
      };
    }
    
    groups[key].totalCommission += setterCallerCommission;
    groups[key].salesCount++;
    groups[key].sales.push({
      id: sale.id,
      amount: sale.amountWithoutVat,
      commission: setterCallerCommission
    });
  }
  
  logger.info('=== GROUPING RESULTS ===');
  logger.info(`Total sales to process: ${sales.length}`);
  logger.info(`Valid groupings created: ${Object.keys(groups).length}`);
  logger.info(`Sales skipped: ${skippedCount}`);
  
  if (Object.keys(groups).length > 0) {
    logger.info('Sample group (first):');
    const firstKey = Object.keys(groups)[0];
    const firstGroup = groups[firstKey];
    logger.info(`  Key: ${firstKey}`);
    logger.info(`  Name: ${firstGroup.name}`);
    logger.info(`  Project: ${firstGroup.project}`);
    logger.info(`  Total Commission: ${firstGroup.totalCommission}`);
    logger.info(`  Sales Count: ${firstGroup.salesCount}`);
  } else {
    logger.warn('NO VALID GROUPINGS CREATED');
    logger.warn('All sales were filtered out. Common reasons:');
    logger.warn('1. Utm Campaign names do not match regex pattern');
    logger.warn('2. Invalid project names');
    logger.warn('3. Zero commission amounts');
  }
  
  return groups;
}

