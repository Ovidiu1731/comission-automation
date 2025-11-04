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
  getCurrentMonthYearString
} from './config/constants.js';
import { processSalesRepCommissions } from './services/salesRepService.js';
import { processSetterCallerCommissions } from './services/setterCallerService.js';
import { processTeamLeaderCommissions } from './services/teamLeaderService.js';
import { processStripeFees } from './services/stripeService.js';
import { processFacebookAds } from './services/facebookAdsService.js';
import { processCopywritingCommissions } from './services/copywritingService.js';
import { processPNL } from './services/pnlService.js';

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
 */
async function processCommissions() {
  const startTime = Date.now();
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  const monthYear = getCurrentMonthYearString();
  
  logger.info('Commission automation started', {
    month,
    year,
    monthYear,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Process Sales Rep commissions
    logger.info('Processing Sales Rep commissions...');
    const salesRepResults = await processSalesRepCommissions();
    
    logger.info('Sales Rep processing completed', salesRepResults);
    
    // Process Setter/Caller commissions
    logger.info('Processing Setter/Caller commissions...');
    const setterCallerResults = await processSetterCallerCommissions();
    
    logger.info('Setter/Caller processing completed', setterCallerResults);
    
    // Process Team Leader commissions
    logger.info('Processing Team Leader commissions...');
    const teamLeaderResults = await processTeamLeaderCommissions();
    
    logger.info('Team Leader processing completed', teamLeaderResults);
    
    // Process Stripe fees
    logger.info('Processing Stripe fees...');
    const stripeResults = await processStripeFees();
    
    logger.info('Stripe processing completed', stripeResults);
    
    // Process Facebook Ads
    logger.info('Processing Facebook Ads expenses...');
    const facebookAdsResults = await processFacebookAds();
    
    logger.info('Facebook Ads processing completed', facebookAdsResults);
    
    // Process Copywriting commissions
    logger.info('Processing Copywriting commissions...');
    const copywritingResults = await processCopywritingCommissions();
    
    logger.info('Copywriting processing completed', copywritingResults);
    
    // Process P&L records
    logger.info('Processing P&L records...');
    const pnlResults = await processPNL();
    
    logger.info('P&L processing completed', pnlResults);
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('Commission automation completed successfully', {
      duration: `${duration}s`,
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
      duration: `${duration}s`
    });
    
    return {
      success: false,
      error: error.message
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

// Manual P&L refresh endpoint
app.post('/refresh/pnl', async (req, res) => {
  logger.info('Manual P&L refresh triggered via webhook');
  
  try {
    const pnlResults = await processPNL();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: pnlResults
    });
  } catch (error) {
    logger.error('Manual P&L refresh failed', {
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

// Manual full commission processing endpoint
app.post('/refresh/all', async (req, res) => {
  logger.info('Manual full refresh triggered via webhook');
  
  try {
    const results = await processCommissions();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error) {
    logger.error('Manual full refresh failed', {
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
      refreshPnl: `POST /refresh/pnl`,
      refreshAll: `POST /refresh/all`,
      cheltuieliCreated: `POST /webhook/cheltuieli-created`
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

