import dotenv from 'dotenv';
dotenv.config();

import { logger } from './src/utils/logger.js';
import { processSalesRepCommissions } from './src/services/salesRepService.js';
import { processSetterCallerCommissions } from './src/services/setterCallerService.js';
import {
  getCurrentRomanianMonth,
  getCurrentYear,
  getCurrentMonthYearString
} from './src/config/constants.js';

async function runTest() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   🧪 TESTING WITH REAL AIRTABLE DATA              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  const monthYear = getCurrentMonthYearString();
  
  console.log(`📅 Processing: ${monthYear}\n`);
  console.log('This will process ALL commission data from Airtable...\n');
  console.log('⏳ This may take a few minutes due to rate limiting...\n');
  
  const startTime = Date.now();
  
  try {
    // Process Sales Rep commissions
    console.log('1️⃣  Processing Sales Rep commissions...\n');
    const salesRepResults = await processSalesRepCommissions();
    console.log('\n✅ Sales Rep processing complete!\n');
    console.log('Results:', JSON.stringify(salesRepResults, null, 2));
    console.log('');
    
    // Process Setter/Caller commissions
    console.log('2️⃣  Processing Setter/Caller commissions...\n');
    const setterCallerResults = await processSetterCallerCommissions();
    console.log('\n✅ Setter/Caller processing complete!\n');
    console.log('Results:', JSON.stringify(setterCallerResults, null, 2));
    console.log('');
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║              ✅ TEST COMPLETED!                    ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    console.log('📊 SUMMARY:');
    console.log(`   • Total expenses created: ${salesRepResults.created + setterCallerResults.created}`);
    console.log(`   • Duplicates skipped: ${salesRepResults.skipped + setterCallerResults.skipped}`);
    console.log(`   • Errors: ${salesRepResults.errors + setterCallerResults.errors}`);
    console.log(`   • Processing time: ${duration}s\n`);
    
    if (salesRepResults.created + setterCallerResults.created > 0) {
      console.log('💰 NEW EXPENSE RECORDS CREATED IN AIRTABLE!');
      console.log('   Check the "Cheltuieli" table to see them.\n');
    }
    
    if (salesRepResults.skipped + setterCallerResults.skipped > 0) {
      console.log('⏭️  Some records were skipped (already exist as expenses)');
      console.log('   This is normal for duplicate prevention.\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

runTest();

