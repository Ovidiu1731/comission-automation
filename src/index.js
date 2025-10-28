/**
 * Commission Automation System - Main Entry Point
 * 
 * Automates commission expense tracking for Ascendix projects.
 * Runs on a schedule to process sales rep and setter/caller commissions.
 */
import dotenv from 'dotenv';
import cron from 'node-cron';
import { logger } from './utils/logger.js';
import {
  getCurrentRomanianMonth,
  getCurrentYear,
  getCurrentMonthYearString
} from './config/constants.js';
import { processSalesRepCommissions } from './services/salesRepService.js';
import { processSetterCallerCommissions } from './services/setterCallerService.js';

// Load environment variables
dotenv.config();

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
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('Commission automation completed successfully', {
      duration: `${duration}s`,
      salesRep: salesRepResults,
      setterCaller: setterCallerResults,
      totalExpensesCreated: salesRepResults.created + setterCallerResults.created,
      totalExpensesSkipped: salesRepResults.skipped + setterCallerResults.skipped,
      totalErrors: salesRepResults.errors + setterCallerResults.errors
    });
    
    return {
      success: true,
      salesRep: salesRepResults,
      setterCaller: setterCallerResults
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
 * Initialize cron schedule
 */
function initializeScheduler() {
  // Default to 2:10 AM UTC (4:10 AM Romania time) - TESTING
  // Romania timezone is UTC+2 (EET) or UTC+3 (EEST)
  // Daily at 5:25 AM Romania time
  const cronSchedule = process.env.CRON_SCHEDULE || '25 5 * * *'; // 5:25 AM Romania time
  
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
    version: '1.0.0'
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
          logger.info('Development run completed. Process will exit.');
          process.exit(0);
        }
      })
      .catch((error) => {
        logger.error('Development run failed', {
          error: error.message
        });
        process.exit(1);
      });
  } else {
    logger.info('Production mode: waiting for scheduled runs only');
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

