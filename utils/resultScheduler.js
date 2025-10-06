const cron = require('node-cron');
const Result = require('../models/Result');

class ResultScheduler {
  static init() {
    // Run every hour to check for expired results
    cron.schedule('0 * * * *', async () => {
      try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const deletedResults = await Result.deleteMany({
          declaredAt: { $lte: twentyFourHoursAgo }
        });
        
        if (deletedResults.deletedCount > 0) {
          console.log(`Auto-deleted ${deletedResults.deletedCount} expired results`);
        }
      } catch (error) {
        console.error('Error in auto-delete scheduler:', error);
      }
    });
    
    console.log('Result auto-delete scheduler initialized');
  }
  
  // Schedule specific result for deletion
  static scheduleResultDeletion(resultId, deleteAt) {
    const delay = deleteAt.getTime() - Date.now();
    
    if (delay > 0) {
      setTimeout(async () => {
        try {
          await Result.findByIdAndDelete(resultId);
          console.log(`Auto-deleted result: ${resultId}`);
        } catch (error) {
          console.error(`Error deleting result ${resultId}:`, error);
        }
      }, delay);
    }
  }
}

module.exports = ResultScheduler;