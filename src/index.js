/**
 * Commission Automation System - Main Entry Point
 * 
 * Automates commission expense tracking for Ascendix projects.
 * Runs on a schedule to process sales rep and setter/caller commissions.
 */
import dotenv from 'dotenv';
import cron from 'node-cron';
import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger.js';
import {
  getCurrentRomanianMonth,
  getCurrentYear,
  getCurrentMonthYearString,
  ROMANIAN_MONTHS
} from './config/constants.js';
import { processSalesRepCommissions } from './services/salesRepService.js';
import { processSetterCallerCommissions } from './services/setterCallerService.js';
import { processTeamLeaderCommissions } from './services/teamLeaderService.js';
import { processStripeFees } from './services/stripeService.js';
import { processFacebookAds } from './services/facebookAdsService.js';
import { processCopywritingCommissions } from './services/copywritingService.js';
import { processPNL } from './services/pnlService.js';
import { runCleanup } from '../scripts/cleanup-airtable-data.js';
import { getAllMonthYearsFromSales } from './services/airtableService.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes (allows Airtable scripts to call our API)
app.use(express.json());

/**
 * Main processing function
 * @param {string} targetMonthYear - Optional. Format: "Luna YYYY" (e.g., "Octombrie 2025"). If provided, only processes that month.
 */
async function processCommissions(targetMonthYear = null) {
  const startTime = Date.now();
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  const monthYear = getCurrentMonthYearString();
  
  logger.info('Commission automation started', {
    month,
    year,
    monthYear,
    targetMonthYear,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Process Sales Rep commissions
    logger.info('Processing Sales Rep commissions...');
    const salesRepResults = await processSalesRepCommissions(targetMonthYear);
    
    logger.info('Sales Rep processing completed', salesRepResults);
    
    // Process Setter/Caller commissions
    logger.info('Processing Setter/Caller commissions...');
    const setterCallerResults = await processSetterCallerCommissions(targetMonthYear);
    
    logger.info('Setter/Caller processing completed', setterCallerResults);
    
    // Process Team Leader commissions
    logger.info('Processing Team Leader commissions...');
    const teamLeaderResults = await processTeamLeaderCommissions(targetMonthYear);
    
    logger.info('Team Leader processing completed', teamLeaderResults);
    
    // Process Stripe fees
    logger.info('Processing Stripe fees...');
    const stripeResults = await processStripeFees(targetMonthYear);
    
    logger.info('Stripe processing completed', stripeResults);
    
    // Process Facebook Ads
    logger.info('Processing Facebook Ads expenses...');
    const facebookAdsResults = await processFacebookAds(targetMonthYear);
    
    logger.info('Facebook Ads processing completed', facebookAdsResults);
    
    // Process Copywriting commissions
    logger.info('Processing Copywriting commissions...');
    const copywritingResults = await processCopywritingCommissions(targetMonthYear);
    
    logger.info('Copywriting processing completed', copywritingResults);
    
    // Process P&L records
    logger.info('Processing P&L records...');
    const pnlResults = await processPNL(targetMonthYear);
    
    logger.info('P&L processing completed', pnlResults);
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('Commission automation completed successfully', {
      duration: `${duration}s`,
      targetMonthYear,
      salesRep: salesRepResults,
      setterCaller: setterCallerResults,
      teamLeader: teamLeaderResults,
      stripe: stripeResults,
      facebookAds: facebookAdsResults,
      copywriting: copywritingResults,
      pnl: pnlResults,
      totalExpensesCreated: salesRepResults.created + setterCallerResults.created + teamLeaderResults.created + stripeResults.created + facebookAdsResults.created + copywritingResults.created,
      totalExpensesUpdated: (salesRepResults.updated || 0) + (setterCallerResults.updated || 0) + (teamLeaderResults.updated || 0) + (stripeResults.updated || 0) + (facebookAdsResults.updated || 0) + (copywritingResults.updated || 0),
      totalExpensesSkipped: salesRepResults.skipped + setterCallerResults.skipped + teamLeaderResults.skipped + stripeResults.skipped + facebookAdsResults.skipped + copywritingResults.skipped,
      totalErrors: salesRepResults.errors + setterCallerResults.errors + teamLeaderResults.errors + stripeResults.errors + facebookAdsResults.errors + copywritingResults.errors,
      totalPNLCreated: pnlResults.created,
      totalPNLUpdated: pnlResults.updated
    });
    
    return {
      success: true,
      targetMonthYear,
      salesRep: salesRepResults,
      setterCaller: setterCallerResults,
      teamLeader: teamLeaderResults,
      stripe: stripeResults,
      facebookAds: facebookAdsResults,
      copywriting: copywritingResults,
      pnl: pnlResults
    };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.error('Commission automation failed', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}s`,
      targetMonthYear
    });
    
    return {
      success: false,
      error: error.message,
      targetMonthYear
    };
  }
}

/**
 * Webhook endpoints
 */

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get available months endpoint (for month selection in Airtable)
app.get('/refresh/months', async (req, res) => {
  logger.info('Fetching available months for refresh');
  
  try {
    const monthYears = await getAllMonthYearsFromSales();
    
    // Sort months by year and month (most recent first)
    const sortedMonthYears = monthYears.sort((a, b) => {
      const [monthA, yearA] = a.split(' ');
      const [monthB, yearB] = b.split(' ');
      const yearDiff = parseInt(yearB) - parseInt(yearA);
      if (yearDiff !== 0) return yearDiff;
      
      const monthIndexA = ROMANIAN_MONTHS.indexOf(monthA);
      const monthIndexB = ROMANIAN_MONTHS.indexOf(monthB);
      return monthIndexB - monthIndexA;
    });
    
    res.json({
      success: true,
      months: sortedMonthYears,
      count: sortedMonthYears.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch available months', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Manual full commission processing endpoint (refreshes Cheltuieli + P&L for ALL months)
app.post('/refresh/all', async (req, res) => {
  logger.info('Manual full refresh triggered via webhook');
  
  // Respond immediately to prevent timeout
  res.json({
    success: true,
    message: 'Full refresh started for ALL months. Processing in background...',
    timestamp: new Date().toISOString(),
    note: 'This will take 2-3 minutes. Check Cheltuieli and P&L tables to see updates.'
  });
  
  // Process in background (don't await - let it run asynchronously)
  processCommissions()
    .then((results) => {
      logger.info('Background full refresh completed successfully', {
        results,
        timestamp: new Date().toISOString()
      });
    })
    .catch((error) => {
      logger.error('Background full refresh failed', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });
});

// Single month refresh endpoint (refreshes Cheltuieli + P&L for specific month)
app.post('/refresh/month', async (req, res) => {
  const { monthYear } = req.body;
  
  if (!monthYear) {
    return res.status(400).json({
      success: false,
      error: 'monthYear parameter is required. Format: "Luna YYYY" (e.g., "Octombrie 2025")',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate format: "Luna YYYY"
  const monthYearRegex = /^([A-Za-zăâîșțĂÂÎȘȚ]+)\s+(\d{4})$/;
  const match = monthYear.match(monthYearRegex);
  
  if (!match) {
    return res.status(400).json({
      success: false,
      error: 'Invalid monthYear format. Expected: "Luna YYYY" (e.g., "Octombrie 2025")',
      received: monthYear,
      timestamp: new Date().toISOString()
    });
  }
  
  const [, month, year] = match;
  
  // Validate month is a valid Romanian month
  if (!ROMANIAN_MONTHS.includes(month)) {
    return res.status(400).json({
      success: false,
      error: `Invalid Romanian month name: ${month}`,
      validMonths: ROMANIAN_MONTHS,
      received: monthYear,
      timestamp: new Date().toISOString()
    });
  }
  
  logger.info('Manual single-month refresh triggered via webhook', {
    monthYear,
    month,
    year
  });
  
  // Respond immediately to prevent timeout
  res.json({
    success: true,
    message: `Refresh started for ${monthYear}. Processing in background...`,
    monthYear,
    month,
    year,
    timestamp: new Date().toISOString(),
    note: 'This will take 30-60 seconds. Check Cheltuieli and P&L tables to see updates.'
  });
  
  // Process in background (don't await - let it run asynchronously)
  processCommissions(monthYear)
    .then((results) => {
      logger.info('Background single-month refresh completed successfully', {
        results,
        monthYear,
        timestamp: new Date().toISOString()
      });
    })
    .catch((error) => {
      logger.error('Background single-month refresh failed', {
        error: error.message,
        stack: error.stack,
        monthYear,
        timestamp: new Date().toISOString()
      });
    });
});

// Webhook endpoint for Airtable automation when manual Cheltuieli record is created
app.post('/webhook/cheltuieli-created', async (req, res) => {
  logger.info('Cheltuieli record created webhook triggered', {
    body: req.body
  });
  
  // Respond immediately to Airtable (don't make it wait)
  res.json({
    success: true,
    message: 'P&L refresh queued',
    timestamp: new Date().toISOString()
  });
  
  // Process P&L asynchronously (don't block the response)
  try {
    logger.info('Processing P&L update due to manual Cheltuieli entry...');
    const pnlResults = await processPNL();
    
    logger.info('P&L updated successfully after manual Cheltuieli entry', {
      results: pnlResults
    });
  } catch (error) {
    logger.error('Failed to update P&L after manual Cheltuieli entry', {
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Cleanup endpoint - fixes existing data inconsistencies
 */
app.post('/cleanup/data', async (req, res) => {
  logger.info('Data cleanup endpoint called');
  
  try {
    // Respond immediately
    res.json({ 
      success: true, 
      message: 'Data cleanup started. Check logs for progress.' 
    });
    
    // Run cleanup asynchronously
    const results = await runCleanup();
    
    logger.info('Data cleanup completed', results);
  } catch (error) {
    logger.error('Data cleanup failed', {
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Initialize cron schedule
 */
function initializeScheduler() {
  // Every hour at minute 0
  // Romania timezone is UTC+2 (EET) or UTC+3 (EEST)
  const cronSchedule = process.env.CRON_SCHEDULE || '0 * * * *'; // Every hour
  
  logger.info('Initializing cron scheduler', { schedule: cronSchedule });
  
  cron.schedule(cronSchedule, async () => {
    logger.info('Cron job triggered, starting commission processing');
    await processCommissions();
  }, {
    scheduled: true,
    timezone: 'Europe/Bucharest' // Romania timezone
  });
  
  logger.info('Cron scheduler initialized successfully', {
    schedule: cronSchedule,
    timezone: 'Europe/Bucharest'
  });
}

/**
 * Start the application
 */
function start() {
  logger.info('Starting Commission Automation System', {
    nodeEnv: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    port: PORT
  });
  
  // Start Express server
  app.listen(PORT, () => {
    logger.info(`Webhook server listening on port ${PORT}`);
    logger.info('Available endpoints:', {
      health: `GET /health`,
      getMonths: `GET /refresh/months (list available months)`,
      refreshAll: `POST /refresh/all (refreshes Cheltuieli + P&L for ALL months)`,
      refreshMonth: `POST /refresh/month (refreshes Cheltuieli + P&L for specific month, body: { monthYear: "Luna YYYY" })`,
      cheltuieliCreated: `POST /webhook/cheltuieli-created`,
      cleanup: `POST /cleanup/data (fixes data inconsistencies)`
    });
  });
  
  // Initialize scheduler
  initializeScheduler();
  
  // If running in production, just wait for cron
  // If running in development or manually triggered, run once immediately
  if (process.env.NODE_ENV !== 'production' || process.argv.includes('--run-now')) {
    logger.info('Running commission processing immediately', {
      reason: process.env.NODE_ENV !== 'production' ? 'development mode' : '--run-now flag'
    });
    
    processCommissions()
      .then(() => {
        if (process.env.NODE_ENV !== 'production') {
          logger.info('Development run completed. Webhook server will remain running.');
          // Don't exit - keep server running for webhook endpoints
        }
      })
      .catch((error) => {
        logger.error('Development run failed', {
          error: error.message
        });
        // Don't exit on error - keep server running
        logger.info('Webhook server will remain running despite error');
      });
  } else {
    logger.info('Production mode: waiting for scheduled runs and webhook triggers');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at', {
    reason,
    promise
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Start the application
start();

