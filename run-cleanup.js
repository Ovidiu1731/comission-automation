/**
 * Run cleanup script locally
 * Usage: node run-cleanup.js
 */

import dotenv from 'dotenv';
import { runCleanup } from './scripts/cleanup-airtable-data.js';

// Load environment variables
dotenv.config();

console.log('Starting Airtable data cleanup...\n');

runCleanup()
  .then(results => {
    console.log('\n✅ Cleanup completed successfully!');
    console.log('Results:', JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Cleanup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

