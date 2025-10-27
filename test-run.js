import dotenv from 'dotenv';
dotenv.config();

import { logger } from './src/utils/logger.js';
import { processSalesRepCommissions } from './src/services/salesRepService.js';
import { processSetterCallerCommissions } from './src/services/setterCallerService.js';

async function test() {
  console.log('🚀 Starting commission automation test...\n');
  
  try {
    // Test Sales Rep processing
    console.log('Testing Sales Rep commissions...');
    const salesRepResults = await processSalesRepCommissions();
    console.log('✅ Sales Rep Results:', salesRepResults);
    
    // Test Setter/Caller processing
    console.log('\nTesting Setter/Caller commissions...');
    const setterCallerResults = await processSetterCallerCommissions();
    console.log('✅ Setter/Caller Results:', setterCallerResults);
    
    console.log('\n🎉 Test completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Expenses created: ${salesRepResults.created + setterCallerResults.created}`);
    console.log(`   - Duplicates skipped: ${salesRepResults.skipped + setterCallerResults.skipped}`);
    console.log(`   - Errors: ${salesRepResults.errors + setterCallerResults.errors}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();

