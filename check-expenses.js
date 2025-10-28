import dotenv from 'dotenv';
dotenv.config();

import { base } from './src/config/airtable.js';
import { TABLES, FIELDS } from './src/config/constants.js';

async function checkExpenses() {
  console.log('\n🔍 Checking for automatic expense records in Airtable...\n');
  
  try {
    let automaticExpenses = [];
    
    await base(TABLES.EXPENSES)
      .select({
        filterByFormula: `{${FIELDS.EXPENSE_SOURCE}} = "Automatic"`,
        maxRecords: 100
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach(record => {
          automaticExpenses.push({
            id: record.id,
            expense: record.get(FIELDS.EXPENSE_NAME),
            project: record.get(FIELDS.EXPENSE_PROJECT),
            category: record.get(FIELDS.EXPENSE_CATEGORY),
            amount: record.get(FIELDS.EXPENSE_AMOUNT),
            month: record.get(FIELDS.EXPENSE_MONTH),
            date: record.get(FIELDS.EXPENSE_DATE)
          });
        });
        fetchNextPage();
      });
    
    console.log(`Found ${automaticExpenses.length} automatic expense records:\n`);
    
    if (automaticExpenses.length > 0) {
      automaticExpenses.forEach(expense => {
        console.log(`  • ${expense.expense} - ${expense.project}`);
        console.log(`    Amount: ${expense.amount} RON | Month: ${expense.month}`);
      });
    } else {
      console.log('  No automatic expenses found yet.\n');
      console.log('This is normal if:');
      console.log('  - The system hasn\'t run yet');
      console.log('  - It\'s waiting for the next scheduled run (1:00 AM Romania time)');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkExpenses();

