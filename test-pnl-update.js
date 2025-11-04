#!/usr/bin/env node
/**
 * Test Script - Manual P&L Update
 * 
 * This script runs the same P&L update process that the webhook triggers.
 * Use this to manually test the P&L generation without triggering the webhook.
 * 
 * Usage:
 *   node test-pnl-update.js
 */

import dotenv from 'dotenv';
import { processPNL } from './src/services/pnlService.js';
import { logger } from './src/utils/logger.js';
import {
  getCurrentRomanianMonth,
  getCurrentYear
} from './src/config/constants.js';

// Load environment variables
dotenv.config();

async function main() {
  const startTime = Date.now();
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  
  logger.info('=== Manual P&L Update Test ===', {
    month,
    year,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Run the P&L processing
    logger.info('Starting P&L processing...');
    const results = await processPNL();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('=== P&L Update Complete ===', {
      duration: `${duration}s`,
      results,
      timestamp: new Date().toISOString()
    });
    
    console.log('\n✅ SUCCESS!');
    console.log('─────────────────────────────────────');
    console.log(`Duration: ${duration}s`);
    console.log(`Projects Processed: ${results.processed}`);
    console.log(`Records Created: ${results.created}`);
    console.log(`Records Updated: ${results.updated}`);
    console.log(`Errors: ${results.errors}`);
    console.log('─────────────────────────────────────\n');
    
    process.exit(0);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.error('=== P&L Update Failed ===', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}s`
    });
    
    console.error('\n❌ FAILED!');
    console.error('─────────────────────────────────────');
    console.error(`Error: ${error.message}`);
    console.error(`Duration: ${duration}s`);
    console.error('─────────────────────────────────────\n');
    
    process.exit(1);
  }
}

// Run the script
main();

