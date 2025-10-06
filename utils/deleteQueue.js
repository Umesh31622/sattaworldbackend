
// utils/deleteQueue.js
const Queue = require('bull');
const Result = require('../models/Result');

const deleteQueue = new Queue('result deletion', {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
  }
});

// Process deletion jobs
deleteQueue.process('deleteResult', async (job) => {
  const { resultId } = job.data;
  
  try {
    const deleted = await Result.findByIdAndDelete(resultId);
    if (deleted) {
      console.log(`Successfully deleted result: ${resultId}`);
    }
    return { success: true, resultId };
  } catch (error) {
    console.error(`Failed to delete result ${resultId}:`, error);
    throw error;
  }
});

// Schedule result deletion
const scheduleResultDeletion = (resultId, delayInMs = 24 * 60 * 60 * 1000) => {
  deleteQueue.add('deleteResult', { resultId }, {
    delay: delayInMs,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    }
  });
};

module.exports = { deleteQueue, scheduleResultDeletion };
