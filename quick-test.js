import dotenv from 'dotenv';
dotenv.config();

import { base } from './src/config/airtable.js';
import { TABLES, FIELDS, getCurrentRomanianMonth } from './src/config/constants.js';

async function quickTest() {
  console.log('Testing Airtable connection...\n');
  
  try {
    // Test 1: Fetch a few commission records
    console.log('Test 1: Fetching monthly commissions...');
    let count = 0;
    await base(TABLES.MONTHLY_COMMISSIONS)
      .select({
        maxRecords: 5
      })
      .eachPage((records, fetchNextPage) => {
        count += records.length;
        records.forEach(record => {
          console.log(`   Found: ${record.get(FIELDS.NAME)} - Role: ${record.get(FIELDS.ROLE)}`);
        });
        fetchNextPage();
      });
    
    console.log(`✅ Found ${count} commission records\n`);
    
    // Test 2: Check expense table
    console.log('Test 2: Checking expense table...');
    let expenseCount = 0;
    await base(TABLES.EXPENSES)
      .select({
        maxRecords: 5
      })
      .eachPage((records, fetchNextPage) => {
        expenseCount += records.length;
        fetchNextPage();
      });
    
    console.log(`✅ Found ${expenseCount} expense records\n`);
    
    // Test 3: Get current month
    const month = getCurrentRomanianMonth();
    console.log(`Test 3: Current month is: ${month}\n`);
    
    console.log('🎉 All connection tests passed!');
    console.log('The system is ready to process commissions.\n');
    console.log('Next steps:');
    console.log('1. Push to GitHub');
    console.log('2. Deploy to Railway');
    console.log('3. System will run automatically daily at 1:00 AM Romania time');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

quickTest();

