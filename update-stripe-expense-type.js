/**
 * Update existing Stripe expenses with new expense type
 */
import dotenv from 'dotenv';
import { processStripeFees } from './src/services/stripeService.js';
import { logger } from './src/utils/logger.js';

dotenv.config();

async function run() {
  logger.info('=== UPDATING STRIPE EXPENSES WITH NEW EXPENSE TYPE ===');
  logger.info('New type: "Taxe și comisioane bancare"');
  logger.info('');
  
  try {
    const results = await processStripeFees();
    
    logger.info('');
    logger.info('=== UPDATE RESULTS ===');
    logger.info(`Expenses updated: ${results.updated}`);
    
    if (results.updated > 0) {
      logger.info('');
      logger.info(`✅ SUCCESS! Updated ${results.updated} Stripe expense(s)!`);
      logger.info('');
      logger.info('Changed from:');
      logger.info('  Tip Cheltuiala: "Comisioane"');
      logger.info('To:');
      logger.info('  Tip Cheltuiala: "Taxe și comisioane bancare"');
    }
    
    logger.info('');
    logger.info('=== UPDATE COMPLETE ===');
    process.exit(0);
  } catch (error) {
    logger.error('Update failed:', error.message);
    
    if (error.message.includes('Insufficient permissions')) {
      logger.error('');
      logger.error('⚠️  Please add "Taxe și comisioane bancare" as an option in:');
      logger.error('    Airtable → Cheltuieli table → Tip Cheltuiala field');
      logger.error('');
    }
    
    logger.error('Stack:', error.stack);
    process.exit(1);
  }
}

run();

