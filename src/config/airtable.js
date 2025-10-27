/**
 * Airtable connection configuration
 */
import Airtable from 'airtable';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.AIRTABLE_API_KEY) {
  throw new Error('AIRTABLE_API_KEY environment variable is required');
}

if (!process.env.AIRTABLE_BASE_ID) {
  throw new Error('AIRTABLE_BASE_ID environment variable is required');
}

// Initialize Airtable connection
const airtable = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
});

export const base = airtable.base(process.env.AIRTABLE_BASE_ID);

logger.info('Airtable connection initialized', {
  baseId: process.env.AIRTABLE_BASE_ID
});

