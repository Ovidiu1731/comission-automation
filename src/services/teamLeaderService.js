/**
 * Team Leader Commission Processing
 * 
 * Calculates Team Leader commissions based on sales from monthly commission records.
 * Uses THE SAME sales as Setter/Caller commissions (from "Comisioane Lunare" table).
 * - George Coapsi (Team Leader Setteri): 5% of all Setter-generated sales
 * - Alexandru Prisiceanu (Team Leader Calleri): 2% of all Caller-generated sales
 * 
 * Commissions are calculated from "Total După TVA" (amount without VAT).
 */
import {
  getMonthlySetterCallerCommissions,
  getSalesByIds,
  getExpenseByExpenseId,
  createExpense,
  updateExpense,
  getRepresentativeByExactName,
  getMonthlyCommissionByRepAndMonth,
  createMonthlyCommission,
  updateMonthlyCommission
} from './airtableService.js';
import {
  FIELDS,
  VAT_INCLUDED,
  SOURCE,
  TEAM_LEADERS,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import {
  isValidExpenseAmount,
  isValidProject
} from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Process all Team Leader commissions for current month
 * Uses monthly commission records from "Comisioane Lunare" as source of truth
 */
export async function processTeamLeaderCommissions() {
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  
  logger.info('=== Processing Team Leader Commissions ===');
  logger.info('Using monthly commission records from "Comisioane Lunare"');
  logger.info('Month:', month);
  logger.info('Year:', year);
  
  const stats = {
    processed: 0,
    setterSales: 0,
    callerSales: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    errors: 0,
    georgeCoapsiTotal: 0,
    alexandruPrisiceanuTotal: 0
  };
  
  try {
    // Get all monthly commissions for Setters/Callers
    // This is THE SAME source that SetterCallerService uses
    const commissions = await getMonthlySetterCallerCommissions(month);
    
    if (commissions.length === 0) {
      logger.info('No Setter/Caller commissions found for Team Leader processing', { month });
      return stats;
    }
    
    logger.info(`Found ${commissions.length} monthly Setter/Caller commission records`);
    
    // Process each commission record
    const teamLeaderCommissionsByProject = {};
    
    for (const commission of commissions) {
      const { id: commissionId, sales: saleIds, name, role } = commission;
      
      logger.info(`Processing commission: ${name}`, {
        role,
        salesCount: saleIds?.length || 0
      });
      
      // Check if there are associated sales
      if (!saleIds || saleIds.length === 0) {
        logger.warn('No associated sales for commission, skipping', { commissionId, name });
        stats.skipped++;
        continue;
      }
      
      // Determine if this is Setter or Caller
      const roles = Array.isArray(role) ? role : [role];
      let teamLeaderConfig = null;
      
      if (roles.includes('Setter')) {
        teamLeaderConfig = TEAM_LEADERS.SETTER;
        logger.debug(`${name} is a Setter → Team Leader: ${teamLeaderConfig.name}`);
      } else if (roles.includes('Caller')) {
        teamLeaderConfig = TEAM_LEADERS.CALLER;
        logger.debug(`${name} is a Caller → Team Leader: ${teamLeaderConfig.name}`);
      } else {
        logger.debug(`${name} role is ${roles.join(', ')} - not Setter or Caller, skipping`);
        stats.skipped++;
        continue;
      }
      
      // Fetch full sale records
      const sales = await getSalesByIds(saleIds);
      
      logger.info(`Fetched ${sales.length} sales for ${name}`);
      
      // Process each sale
      for (const sale of sales) {
        stats.processed++;
        
        // Validate amount exists (allow negative amounts for refunds)
        if (sale.amountWithoutVat === null || sale.amountWithoutVat === undefined) {
          logger.debug('Skipping sale - missing amount', {
            saleId: sale.id,
            amount: sale.amountWithoutVat
          });
          stats.skipped++;
          continue;
        }
        
        // Validate project
        if (!isValidProject(sale.project)) {
          logger.debug('Skipping sale - invalid project', {
            saleId: sale.id,
            project: sale.project
          });
          stats.skipped++;
          continue;
        }
        
        // Calculate Team Leader commission (includes refunds)
        const commission = sale.amountWithoutVat * teamLeaderConfig.commissionRate;
        const isRefund = sale.amountWithoutVat < 0;
        
        // Track for stats (only count positive sales, not refunds)
        if (teamLeaderConfig.name === TEAM_LEADERS.SETTER.name) {
          if (!isRefund) stats.setterSales++;
          stats.georgeCoapsiTotal += commission;
        } else {
          if (!isRefund) stats.callerSales++;
          stats.alexandruPrisiceanuTotal += commission;
        }
        
        // Group by Team Leader + Project
        const key = `${teamLeaderConfig.name}_${sale.project}`;
        if (!teamLeaderCommissionsByProject[key]) {
          teamLeaderCommissionsByProject[key] = {
            teamLeaderName: teamLeaderConfig.name,
            teamLeaderType: teamLeaderConfig.name === TEAM_LEADERS.SETTER.name ? 'Setter' : 'Caller',
            category: teamLeaderConfig.category,
            project: sale.project,
            commissionRate: teamLeaderConfig.commissionRate,
            totalCommission: 0,
            salesCount: 0,
            saleIds: []
          };
        }
        
        teamLeaderCommissionsByProject[key].totalCommission += commission;
        // Only count positive sales, not refunds
        if (!isRefund) teamLeaderCommissionsByProject[key].salesCount++;
        teamLeaderCommissionsByProject[key].saleIds.push(sale.id);
        
        logger.debug('Calculated Team Leader commission', {
          saleId: sale.id,
          project: sale.project,
          teamLeader: teamLeaderConfig.name,
          amount: sale.amountWithoutVat,
          rate: teamLeaderConfig.commissionRate,
          commission
        });
      }
    }
    
    logger.info('Team Leader commission calculation complete', {
      processed: stats.processed,
      setterSales: stats.setterSales,
      callerSales: stats.callerSales,
      skipped: stats.skipped,
      georgeCoapsiTotal: stats.georgeCoapsiTotal.toFixed(2),
      alexandruPrisiceanuTotal: stats.alexandruPrisiceanuTotal.toFixed(2)
    });
    
    const grouped = Object.values(teamLeaderCommissionsByProject);
    logger.info(`Grouped into ${grouped.length} Team Leader + Project combinations`);
    
    // Group by team leader (aggregate all projects for monthly commission record)
    const teamLeaderSummary = {};
    
    for (const group of grouped) {
      const { teamLeaderName } = group;
      
      if (!teamLeaderSummary[teamLeaderName]) {
        teamLeaderSummary[teamLeaderName] = {
          teamLeaderName,
          totalCommission: 0,
          salesCount: 0,
          saleIds: new Set()
        };
      }
      
      teamLeaderSummary[teamLeaderName].totalCommission += group.totalCommission;
      teamLeaderSummary[teamLeaderName].salesCount += group.salesCount;
      group.saleIds.forEach(id => teamLeaderSummary[teamLeaderName].saleIds.add(id));
    }
    
    // Create/update monthly commission records for each team leader
    logger.info('Creating/updating monthly commission records for team leaders');
    
    for (const [teamLeaderName, summary] of Object.entries(teamLeaderSummary)) {
      try {
        await createOrUpdateTeamLeaderMonthlyCommission(
          teamLeaderName,
          summary,
          month,
          year
        );
      } catch (error) {
        logger.error('Failed to create/update team leader monthly commission', {
          teamLeaderName,
          error: error.message,
          stack: error.stack
        });
        stats.errors++;
      }
    }
    
    // Create/update expense records
    for (const group of grouped) {
      try {
        const result = await createOrUpdateTeamLeaderExpense(group, month, year);
        if (result === 'created') {
          stats.created++;
        } else if (result === 'updated') {
          stats.updated++;
        }
      } catch (error) {
        logger.error('Failed to create/update Team Leader expense', {
          error: error.message,
          group
        });
        stats.errors++;
      }
    }
    
    logger.info('=== Team Leader Commission Processing Complete ===', stats);
    
    return stats;
  } catch (error) {
    logger.error('Team Leader commission processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Create or update Team Leader monthly commission record in "Comisioane Lunare" table
 */
async function createOrUpdateTeamLeaderMonthlyCommission(teamLeaderName, summary, month, year) {
  logger.info('Creating/updating monthly commission for team leader', {
    teamLeaderName,
    totalCommission: summary.totalCommission.toFixed(2),
    salesCount: summary.salesCount
  });
  
  try {
    // Get representative record for this team leader
    const representative = await getRepresentativeByExactName(teamLeaderName);
    
    if (!representative) {
      logger.warn('Team leader not found in Representatives table, skipping monthly commission record', {
        teamLeaderName
      });
      return null;
    }
    
    logger.info(`Found TL rep: id="${representative.id}" name="${representative.name}"`);
    
    // Check if monthly commission record already exists
    // Search by NAME (not ID) because ARRAYJOIN on linked records returns names
    logger.info(`About to search with: repName="${representative.name}" month="${month}"`);
    const existingCommission = await getMonthlyCommissionByRepAndMonth(
      representative.name,
      month
    );
    logger.info(`Search result: ${existingCommission ? 'FOUND' : 'NOT FOUND'}`);
    
    const saleIds = Array.from(summary.saleIds);
    
    if (existingCommission) {
      // Update existing record
      logger.info('Updating existing monthly commission record for team leader', {
        recordId: existingCommission.id,
        teamLeaderName,
        oldSalesCount: existingCommission.sales?.length || 0,
        newSalesCount: saleIds.length,
        totalCommission: summary.totalCommission.toFixed(2)
      });
      
      await updateMonthlyCommission(existingCommission.id, {
        fields: {
          [FIELDS.SALES]: saleIds,
          [FIELDS.TEAM_LEADER_COMMISSION]: summary.totalCommission
        }
      });
      
      logger.info('✅ Updated monthly commission record for team leader', {
        recordId: existingCommission.id,
        teamLeaderName,
        month,
        salesCount: saleIds.length,
        totalCommission: summary.totalCommission.toFixed(2)
      });
    } else {
      // Create new record
      logger.info('Creating new monthly commission record for team leader', {
        teamLeaderName,
        month,
        salesCount: saleIds.length,
        totalCommission: summary.totalCommission.toFixed(2)
      });
      
      await createMonthlyCommission({
        fields: {
          [FIELDS.REPRESENTATIVE]: [representative.id],
          [FIELDS.MONTH]: month,
          [FIELDS.SALES]: saleIds,
          [FIELDS.TEAM_LEADER_COMMISSION]: summary.totalCommission
        }
      });
      
      logger.info('✅ Created monthly commission record for team leader', {
        teamLeaderName,
        month,
        salesCount: saleIds.length,
        totalCommission: summary.totalCommission.toFixed(2)
      });
    }
  } catch (error) {
    logger.error('Failed to create/update team leader monthly commission', {
      teamLeaderName,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Create or update Team Leader expense record
 * Returns 'created', 'updated', or throws error
 */
async function createOrUpdateTeamLeaderExpense(group, month, year) {
  const { teamLeaderName, teamLeaderType, category, project, totalCommission, salesCount, saleIds } = group;
  
  // Round commission to 2 decimals
  const roundedCommission = Math.round(totalCommission * 100) / 100;
  
  // Validate commission amount
  if (!isValidExpenseAmount(roundedCommission)) {
    logger.warn('Invalid Team Leader commission amount, skipping', {
      teamLeaderName,
      project,
      commission: roundedCommission
    });
    return null;
  }
  
  // Generate unique expense ID: team_leader_{type}_{project}_{month}
  const expenseId = `team_leader_${teamLeaderType.toLowerCase()}_${project}_${month}`
    .replace(/\s+/g, '_');
  
  // Prepare expense data
  const expenseFields = {
    [FIELDS.EXPENSE_DESCRIPTION]: `Teamleader ${teamLeaderType}: ${teamLeaderName} (${salesCount} vanzari)`,
    [FIELDS.EXPENSE_PROJECT]: project,
    [FIELDS.EXPENSE_CATEGORY]: category,
    [FIELDS.EXPENSE_AMOUNT]: roundedCommission,
    [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
    [FIELDS.EXPENSE_MONTH]: month,
    [FIELDS.EXPENSE_YEAR]: year,
    [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
    [FIELDS.EXPENSE_ID]: expenseId,
    [FIELDS.EXPENSE_ASSOCIATED_SALES]: saleIds
  };
  
  try {
    // Check if expense already exists
    const existingExpense = await getExpenseByExpenseId(expenseId);
    
    if (existingExpense) {
      logger.info('Updating existing Team Leader expense', {
        expenseId,
        oldAmount: existingExpense.amount,
        newAmount: roundedCommission,
        salesCount
      });
      
      await updateExpense(existingExpense.id, {
        fields: expenseFields
      });
      
      logger.info('Team Leader expense updated successfully', {
        expenseId,
        teamLeaderName,
        project,
        amount: roundedCommission
      });
      
      return 'updated';
    } else {
      logger.info('Creating new Team Leader expense', {
        expenseId,
        teamLeaderName,
        project,
        amount: roundedCommission,
        salesCount
      });
      
      await createExpense({
        fields: expenseFields
      });
      
      logger.info('Team Leader expense created successfully', {
        expenseId,
        teamLeaderName,
        project,
        amount: roundedCommission
      });
      
      return 'created';
    }
  } catch (error) {
    logger.error('Failed to create/update Team Leader expense', {
      error: error.message,
      expenseId,
      teamLeaderName,
      project
    });
    throw error;
  }
}
