import dotenv from 'dotenv';
dotenv.config();

import { base } from './src/config/airtable.js';
import { TABLES, FIELDS } from './src/config/constants.js';

async function debugTest() {
  console.log('Fetching first commission...');
  
  let firstCommission = null;
  await base(TABLES.MONTHLY_COMMISSIONS)
    .select({
      filterByFormula: '{Lună} = "Octombrie"',
      maxRecords: 1
    })
    .eachPage((records, fetchNextPage) => {
      if (records.length > 0) {
        const rec = records[0];
        firstCommission = {
          id: rec.id,
          name: rec.get(FIELDS.NAME),
          salesIds: rec.get(FIELDS.SALES) || [],
          finalCommission: rec.get(FIELDS.FINAL_COMMISSION),
          role: rec.get(FIELDS.ROLE)
        };
      }
      fetchNextPage();
    });
  
  console.log('\nCommission:', JSON.stringify(firstCommission, null, 2));
  
  if (firstCommission && firstCommission.salesIds.length > 0) {
    console.log(`\nFetching ${firstCommission.salesIds.length} sales records...`);
    // This is where it might be hanging
    console.log('Sales IDs:', firstCommission.salesIds.slice(0, 3), '...');
  }
  
  process.exit(0);
}

debugTest();

