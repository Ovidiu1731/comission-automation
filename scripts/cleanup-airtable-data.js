/**
 * Data Cleanup Script for Airtable
 * 
 * Fixes existing data inconsistencies:
 * 1. Populates empty "Cheltuiala" fields in P&L records from "Descriere"
 * 2. Merges duplicate Team Leader records
 * 3. Updates "TeamLeaders" category to "Team Leader"
 */

import { base } from '../src/config/airtable.js';
import { TABLES, FIELDS, PNL_CATEGORIES } from '../src/config/constants.js';
import { logger } from '../src/utils/logger.js';
import { retryWithBackoff } from '../src/services/airtableService.js';

/**
 * Normalize Team Leader names (same logic as in pnlService.js)
 */
function normalizeTeamLeaderName(cheltuialaName) {
  if (!cheltuialaName) return null;
  
  return cheltuialaName
    .replace(/^TM\s+(Callers|Setters):\s*/i, '')
    .replace(/^Teamleader\s+(Caller|Setter):\s*/i, '')
    .replace(/\s*\(\d+\s+vanzari\)$/i, '')
    .trim();
}

/**
 * Fix empty Cheltuiala fields in P&L records
 */
async function fixEmptyCheltuialaFields() {
  logger.info('=== Fixing Empty Cheltuiala Fields ===');
  
  try {
    const recordsToUpdate = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.PNL)
        .select({
          filterByFormula: `{${FIELDS.PNL_CHELTUIALA}} = ""`,
          fields: [
            FIELDS.PNL_CHELTUIALA,
            FIELDS.PNL_DESCRIERE,
            FIELDS.PNL_PROJECT,
            FIELDS.PNL_MONTH,
            FIELDS.PNL_CATEGORY
          ]
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const cheltuiala = record.get(FIELDS.PNL_CHELTUIALA);
            const descriere = record.get(FIELDS.PNL_DESCRIERE);
            const project = record.get(FIELDS.PNL_PROJECT);
            const month = record.get(FIELDS.PNL_MONTH);
            const category = record.get(FIELDS.PNL_CATEGORY);
            
            // Only update if Descriere has content
            if (descriere && descriere.trim()) {
              // Extract name from description
              let newCheltuiala = descriere.trim();
              
              // Clean up common patterns
              if (newCheltuiala.includes(' - ')) {
                // Extract name before " - Month"
                newCheltuiala = newCheltuiala.split(' - ')[0].trim();
              }
              
              recordsToUpdate.push({
                id: record.id,
                fields: {
                  [FIELDS.PNL_CHELTUIALA]: newCheltuiala
                }
              });
              
              logger.info('Will update empty Cheltuiala', {
                recordId: record.id,
                project,
                month,
                category,
                oldCheltuiala: cheltuiala || '(empty)',
                newCheltuiala,
                sourceDescriere: descriere
              });
            } else {
              logger.warn('Skipping record - no Descriere to use', {
                recordId: record.id,
                project,
                month,
                category
              });
            }
          });
          fetchNextPage();
        });
    });
    
    // Also check records where Cheltuiala field might be missing (not in fields)
    // We'll fetch all records and check programmatically
    await retryWithBackoff(async () => {
      await base(TABLES.PNL)
        .select({
          fields: [
            FIELDS.PNL_CHELTUIALA,
            FIELDS.PNL_DESCRIERE,
            FIELDS.PNL_PROJECT,
            FIELDS.PNL_MONTH,
            FIELDS.PNL_CATEGORY
          ]
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const cheltuiala = record.get(FIELDS.PNL_CHELTUIALA);
            const descriere = record.get(FIELDS.PNL_DESCRIERE);
            const project = record.get(FIELDS.PNL_PROJECT);
            const month = record.get(FIELDS.PNL_MONTH);
            const category = record.get(FIELDS.PNL_CATEGORY);
            
            // Check if Cheltuiala is empty or missing
            if (!cheltuiala || cheltuiala.trim() === '') {
              // Only update if Descriere has content and we haven't already added this record
              if (descriere && descriere.trim() && !recordsToUpdate.find(r => r.id === record.id)) {
                // Extract name from description
                let newCheltuiala = descriere.trim();
                
                // Clean up common patterns
                if (newCheltuiala.includes(' - ')) {
                  // Extract name before " - Month"
                  newCheltuiala = newCheltuiala.split(' - ')[0].trim();
                }
                
                recordsToUpdate.push({
                  id: record.id,
                  fields: {
                    [FIELDS.PNL_CHELTUIALA]: newCheltuiala
                  }
                });
                
                logger.info('Will update empty Cheltuiala (from all records check)', {
                  recordId: record.id,
                  project,
                  month,
                  category,
                  oldCheltuiala: cheltuiala || '(empty)',
                  newCheltuiala,
                  sourceDescriere: descriere
                });
              }
            }
          });
          fetchNextPage();
        });
    });
    
    if (recordsToUpdate.length === 0) {
      logger.info('No records with empty Cheltuiala fields found');
      return { updated: 0 };
    }
    
    logger.info(`Found ${recordsToUpdate.length} records to update`);
    
    // Update in batches of 10 (Airtable limit)
    let updated = 0;
    for (let i = 0; i < recordsToUpdate.length; i += 10) {
      const batch = recordsToUpdate.slice(i, i + 10);
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).update(batch);
      });
      
      updated += batch.length;
      logger.info(`Updated ${updated}/${recordsToUpdate.length} records`);
    }
    
    logger.info('✅ Completed fixing empty Cheltuiala fields', { updated });
    return { updated };
  } catch (error) {
    logger.error('Failed to fix empty Cheltuiala fields', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Fix category inconsistency: "TeamLeaders" -> "Team Leader"
 * NOTE: This requires API permission to update select options.
 * If permission is insufficient, these records need manual update in Airtable UI.
 */
async function fixCategoryInconsistency() {
  logger.info('=== Fixing Category Inconsistency ===');
  
  try {
    const recordsToUpdate = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.PNL)
        .select({
          filterByFormula: `{${FIELDS.PNL_CATEGORY}} = "TeamLeaders"`,
          fields: [
            FIELDS.PNL_CATEGORY,
            FIELDS.PNL_PROJECT,
            FIELDS.PNL_MONTH,
            FIELDS.PNL_CHELTUIALA
          ]
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            recordsToUpdate.push({
              id: record.id,
              fields: {
                [FIELDS.PNL_CATEGORY]: PNL_CATEGORIES.TEAM_LEADERS // "Team Leader"
              }
            });
            
            logger.info('Will update category', {
              recordId: record.id,
              project: record.get(FIELDS.PNL_PROJECT),
              month: record.get(FIELDS.PNL_MONTH),
              cheltuiala: record.get(FIELDS.PNL_CHELTUIALA),
              oldCategory: 'TeamLeaders',
              newCategory: PNL_CATEGORIES.TEAM_LEADERS
            });
          });
          fetchNextPage();
        });
    });
    
    if (recordsToUpdate.length === 0) {
      logger.info('No records with "TeamLeaders" category found');
      return { updated: 0, skipped: 0 };
    }
    
    logger.info(`Found ${recordsToUpdate.length} records to update`);
    logger.warn('NOTE: Category updates require API permission to modify select options.');
    logger.warn('If update fails, these records need manual update in Airtable UI.');
    
    // Try to update, but don't fail if permission denied
    try {
      // Update in batches of 10
      let updated = 0;
      for (let i = 0; i < recordsToUpdate.length; i += 10) {
        const batch = recordsToUpdate.slice(i, i + 10);
        
        await retryWithBackoff(async () => {
          await base(TABLES.PNL).update(batch);
        });
        
        updated += batch.length;
        logger.info(`Updated ${updated}/${recordsToUpdate.length} records`);
      }
      
      logger.info('✅ Completed fixing category inconsistency', { updated });
      return { updated, skipped: 0 };
    } catch (error) {
      if (error.message && error.message.includes('Insufficient permissions')) {
        logger.warn('⚠️  Cannot update categories via API - insufficient permissions');
        logger.warn('Please update these records manually in Airtable UI:');
        recordsToUpdate.forEach(r => {
          logger.warn(`  - Record ${r.id}: Change "TeamLeaders" to "Team Leader"`);
        });
        return { updated: 0, skipped: recordsToUpdate.length };
      }
      throw error;
    }
  } catch (error) {
    logger.error('Failed to fix category inconsistency', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Merge duplicate Team Leader records
 */
async function mergeDuplicateTeamLeaderRecords() {
  logger.info('=== Merging Duplicate Team Leader Records ===');
  
  try {
    // Get all Team Leader records
    const teamLeaderRecords = [];
    
    // Get records with both "Team Leader" and "TeamLeaders" categories
    await retryWithBackoff(async () => {
      await base(TABLES.PNL)
        .select({
          filterByFormula: `OR(
            {${FIELDS.PNL_CATEGORY}} = "${PNL_CATEGORIES.TEAM_LEADERS}",
            {${FIELDS.PNL_CATEGORY}} = "TeamLeaders"
          )`,
          fields: [
            FIELDS.PNL_CHELTUIALA,
            FIELDS.PNL_PROJECT,
            FIELDS.PNL_MONTH,
            FIELDS.PNL_YEAR,
            FIELDS.PNL_SUMA_RON,
            FIELDS.PNL_SUMA_EURO,
            FIELDS.PNL_DESCRIERE,
            FIELDS.PNL_CATEGORY
          ]
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            teamLeaderRecords.push({
              id: record.id,
              cheltuiala: record.get(FIELDS.PNL_CHELTUIALA),
              project: record.get(FIELDS.PNL_PROJECT),
              month: record.get(FIELDS.PNL_MONTH),
              year: record.get(FIELDS.PNL_YEAR),
              sumaRON: record.get(FIELDS.PNL_SUMA_RON) || 0,
              sumaEURO: record.get(FIELDS.PNL_SUMA_EURO) || 0,
              descriere: record.get(FIELDS.PNL_DESCRIERE),
              category: record.get(FIELDS.PNL_CATEGORY)
            });
          });
          fetchNextPage();
        });
    });
    
    logger.info(`Found ${teamLeaderRecords.length} Team Leader records`);
    
    // Group by normalized name + project + month + year
    const groups = {};
    const recordsToDelete = [];
    const recordsToUpdate = [];
    
    for (const record of teamLeaderRecords) {
      const normalizedName = normalizeTeamLeaderName(record.cheltuiala);
      const key = `${normalizedName}_${record.project}_${record.month}_${record.year}`;
      
      if (!groups[key]) {
        groups[key] = {
          records: [],
          normalizedName
        };
      }
      
      groups[key].records.push(record);
    }
    
    // Find duplicates (groups with more than 1 record)
    for (const [key, group] of Object.entries(groups)) {
      if (group.records.length > 1) {
        logger.info(`Found ${group.records.length} duplicate records for key: ${key}`);
        
        // Sort by sumaRON (descending) to keep the one with highest amount
        group.records.sort((a, b) => b.sumaRON - a.sumaRON);
        
        const keepRecord = group.records[0];
        const duplicateRecords = group.records.slice(1);
        
        // Sum up amounts from duplicates
        let totalRON = keepRecord.sumaRON;
        let totalEURO = keepRecord.sumaEURO;
        
        for (const dup of duplicateRecords) {
          totalRON += dup.sumaRON;
          totalEURO += dup.sumaEURO;
          
          logger.info('Will delete duplicate', {
            recordId: dup.id,
            cheltuiala: dup.cheltuiala,
            sumaRON: dup.sumaRON,
            project: dup.project,
            month: dup.month
          });
          
          recordsToDelete.push(dup.id);
        }
        
        // Update the kept record with normalized name and summed amounts
        // Also update category to "Team Leader" if it's currently "TeamLeaders"
        const updateFields = {
          [FIELDS.PNL_CHELTUIALA]: group.normalizedName,
          [FIELDS.PNL_SUMA_RON]: Math.round(totalRON * 100) / 100,
          [FIELDS.PNL_SUMA_EURO]: Math.round(totalEURO * 100) / 100
        };
        
        // Update category if it's "TeamLeaders" (but may fail due to permissions)
        if (keepRecord.category === 'TeamLeaders') {
          updateFields[FIELDS.PNL_CATEGORY] = PNL_CATEGORIES.TEAM_LEADERS;
        }
        
        recordsToUpdate.push({
          id: keepRecord.id,
          fields: updateFields
        });
        
        logger.info('Will update kept record', {
          recordId: keepRecord.id,
          oldCheltuiala: keepRecord.cheltuiala,
          newCheltuiala: group.normalizedName,
          oldSumaRON: keepRecord.sumaRON,
          newSumaRON: totalRON,
          duplicatesMerged: duplicateRecords.length
        });
      }
    }
    
    if (recordsToDelete.length === 0 && recordsToUpdate.length === 0) {
      logger.info('No duplicate Team Leader records found');
      return { merged: 0, deleted: 0, updated: 0 };
    }
    
    logger.info(`Found ${recordsToUpdate.length} groups to merge`);
    logger.info(`Will delete ${recordsToDelete.length} duplicate records`);
    logger.info(`Will update ${recordsToUpdate.length} records`);
    
    // Update records first
    let updated = 0;
    for (let i = 0; i < recordsToUpdate.length; i += 10) {
      const batch = recordsToUpdate.slice(i, i + 10);
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).update(batch);
      });
      
      updated += batch.length;
      logger.info(`Updated ${updated}/${recordsToUpdate.length} records`);
    }
    
    // Delete duplicates
    let deleted = 0;
    for (let i = 0; i < recordsToDelete.length; i += 10) {
      const batch = recordsToDelete.slice(i, i + 10);
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).destroy(batch);
      });
      
      deleted += batch.length;
      logger.info(`Deleted ${deleted}/${recordsToDelete.length} duplicate records`);
    }
    
    logger.info('✅ Completed merging duplicate Team Leader records', {
      merged: recordsToUpdate.length,
      deleted,
      updated
    });
    
    return { merged: recordsToUpdate.length, deleted, updated };
  } catch (error) {
    logger.error('Failed to merge duplicate Team Leader records', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Main cleanup function
 */
async function runCleanup() {
  logger.info('=== Starting Airtable Data Cleanup ===');
  
  try {
    const results = {
      emptyCheltuiala: { updated: 0 },
      categoryFix: { updated: 0 },
      duplicates: { merged: 0, deleted: 0, updated: 0 }
    };
    
    // Step 1: Fix empty Cheltuiala fields
    results.emptyCheltuiala = await fixEmptyCheltuialaFields();
    
    // Step 2: Fix category inconsistency (may skip if no API permission)
    results.categoryFix = await fixCategoryInconsistency();
    
    // Step 3: Merge duplicates
    // Note: This works for both "Team Leader" and "TeamLeaders" categories
    results.duplicates = await mergeDuplicateTeamLeaderRecords();
    
    logger.info('=== Cleanup Complete ===', results);
    
    return results;
  } catch (error) {
    logger.error('Cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup()
    .then(results => {
      console.log('Cleanup completed successfully:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}

export { runCleanup, fixEmptyCheltuialaFields, fixCategoryInconsistency, mergeDuplicateTeamLeaderRecords };

