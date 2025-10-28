/**
 * Setter/Caller Commission Processing
 * 
 * Processes 5% commissions for lead generators (people named in Utm Campaign).
 * Filters valid CamelCase names and looks up roles from Reprezentanți table.
 */
import {
  getSetterCallerSales,
  getRepresentativeByName,
  findRepresentativeByFuzzyName,
  expenseExists,
  getExpenseByExpenseId,
  createExpense,
  updateExpense
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
        updated: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    // Group sales by setter/caller name and project (with fuzzy name normalization)
    const groupedSales = await groupSalesBySetterCallerAndProject(sales);
    
    logger.info('Grouped Setter/Caller sales', {
      uniqueGroupings: Object.keys(groupedSales).length,
      totalSales: sales.length
    });
    
    let created = 0;
    let updated = 0;
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
        // Key format: name||project||role
        const [name, project, role] = key.split('||');
        logger.info(`  Name: ${name}, Project: ${project}, Role: ${role}, Commission: ${group.totalCommission}`);
        
        const result = await processSetterCallerGroup(name, project, group, month, year);
        
        logger.info(`  Result: created=${result.created}, updated=${result.updated || 0}, skipped=${result.skipped}`);
        created += result.created;
        updated += (result.updated || 0);
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
      updated,
      skipped,
      errors
    });
    
    return {
      processed: Object.keys(groupedSales).length,
      created,
      updated,
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
 * Now uses role from the group (determined during fuzzy lookup/grouping)
 */
async function processSetterCallerGroup(name, project, group, month, year) {
  const { totalCommission, salesCount, role } = group;
  
  logger.info(`>>> processSetterCallerGroup called: ${name} - ${project} (${role})`);
  logger.info(`  Commission: ${totalCommission}, Sales: ${salesCount}`);
  
  // Validate project
  logger.info('  Step 1: Validating project...');
  if (!isValidProject(project)) {
    logger.warn('Invalid project name, skipping', {
      name,
      project
    });
    return { created: 0, skipped: 1 };
  }
  logger.info('  ✓ Project valid');
  
  // Validate commission amount
  logger.info('  Step 2: Validating commission amount...');
  if (!isValidExpenseAmount(totalCommission)) {
    logger.warn('Invalid commission amount, skipping', {
      name,
      project,
      totalCommission
    });
    return { created: 0, skipped: 1 };
  }
  logger.info('  ✓ Commission amount valid');
  
  // Round to 2 decimal places
  logger.info('  Step 3: Rounding commission...');
  const roundedCommission = Math.round(totalCommission * 100) / 100;
  logger.info(`  ✓ Rounded commission: ${roundedCommission}`);
  
  // Use role from group (already determined during fuzzy lookup)
  logger.info('  Step 4: Using role from group...');
  if (!role) {
    logger.error('Group missing role, this should not happen', { name, project });
    return { created: 0, skipped: 1 };
  }
  logger.info(`  ✓ Role: ${role}`);
  
  // Determine expense category based on role
  logger.info('  Step 5: Determining category...');
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
  logger.info(`  ✓ Category: ${category}`);
  
  // Generate unique expense ID
  logger.info('  Step 6: Generating expense ID...');
  const expenseId = `setter_caller_${name}_${project}_${month.toLowerCase()}`;
  logger.info(`  ✓ Expense ID: ${expenseId}`);
  
  // Check if expense already exists
  logger.info('  Step 7: Checking if expense exists...');
  const existingExpense = await getExpenseByExpenseId(expenseId);
  
  // Prepare expense data
  const expenseFields = {
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
  };
  
  try {
    if (existingExpense) {
      // Update existing expense
      logger.info('  Step 8: Updating existing expense...');
      logger.info(`  Previous amount: ${existingExpense.amount} RON, New amount: ${roundedCommission} RON`);
      
      await updateExpense(existingExpense.id, {
        fields: expenseFields
      });
      
      logger.info('✅ Updated Setter/Caller expense', {
        expenseId,
        name,
        project,
        category,
        oldAmount: existingExpense.amount,
        newAmount: roundedCommission,
        salesCount
      });
      
      return { created: 0, skipped: 0, updated: 1 };
    } else {
      // Create new expense
      logger.info('  Step 8: Creating new expense...');
      
      await createExpense({
        fields: expenseFields
      });
      
      logger.info('✅ Created Setter/Caller expense', {
        expenseId,
        name,
        project,
        category,
        totalCommission: roundedCommission,
        salesCount
      });
      
      return { created: 1, skipped: 0, updated: 0 };
    }
  } catch (error) {
    logger.error('Failed to create/update expense for Setter/Caller', {
      expenseId,
      name,
      project,
      error: error.message
    });
    return { created: 0, skipped: 1, updated: 0 };
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
 * Uses fuzzy name lookup to normalize names and get correct roles
 */
async function groupSalesBySetterCallerAndProject(sales) {
  const groups = {};
  let skippedCount = 0;
  const nameCache = new Map(); // Cache fuzzy lookups to avoid repeated searches
  
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
    
    // Extract name candidate from Utm Campaign
    const nameCandidate = extractSetterCallerName(utmCampaign);
    
    if (!nameCandidate) {
      logger.warn(`SKIPPED - No name candidate found in Utm Campaign: "${utmCampaign}"`);
      skippedCount++;
      continue;
    }
    
    // Use cached lookup result if available
    let lookupResult;
    if (nameCache.has(nameCandidate.toLowerCase())) {
      lookupResult = nameCache.get(nameCandidate.toLowerCase());
      logger.debug(`Using cached lookup for "${nameCandidate}"`);
    } else {
      // Perform fuzzy lookup to normalize name and get role
      lookupResult = await findRepresentativeByFuzzyName(nameCandidate);
      nameCache.set(nameCandidate.toLowerCase(), lookupResult);
    }
    
    if (!lookupResult) {
      logger.warn(`SKIPPED - No representative found for name: "${nameCandidate}" from Utm Campaign: "${utmCampaign}"`);
      skippedCount++;
      continue;
    }
    
    const { name: normalizedName, role } = lookupResult;
    
    logger.info(`MATCHED - "${nameCandidate}" from Utm Campaign "${utmCampaign}" → "${normalizedName}" (${role})`);
    
    // Create group key: normalizedName||project||role
    // Include role in key to ensure we don't mix different roles
    const key = `${normalizedName}||${project}||${role}`;
    
    if (!groups[key]) {
      groups[key] = {
        name: normalizedName,
        project,
        role,
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
      commission: setterCallerCommission,
      originalUtmCampaign: utmCampaign
    });
  }
  
  logger.info('=== GROUPING RESULTS ===');
  logger.info(`Total sales to process: ${sales.length}`);
  logger.info(`Valid groupings created: ${Object.keys(groups).length}`);
  logger.info(`Sales skipped: ${skippedCount}`);
  logger.info(`Name variations normalized: ${nameCache.size}`);
  
  if (Object.keys(groups).length > 0) {
    logger.info('Sample group (first):');
    const firstKey = Object.keys(groups)[0];
    const firstGroup = groups[firstKey];
    logger.info(`  Key: ${firstKey}`);
    logger.info(`  Name: ${firstGroup.name}`);
    logger.info(`  Project: ${firstGroup.project}`);
    logger.info(`  Role: ${firstGroup.role}`);
    logger.info(`  Total Commission: ${firstGroup.totalCommission}`);
    logger.info(`  Sales Count: ${firstGroup.salesCount}`);
  } else {
    logger.warn('NO VALID GROUPINGS CREATED');
    logger.warn('All sales were filtered out. Common reasons:');
    logger.warn('1. Utm Campaign names not found in Reprezentanți table');
    logger.warn('2. Invalid project names');
    logger.warn('3. Zero commission amounts');
  }
  
  return groups;
}

