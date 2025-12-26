/**
 * Polling manager for periodic data fetching
 */

/**
 * @typedef {Object} PollingManager
 * @property {function(): void} start - Start polling
 * @property {function(): void} stop - Stop polling
 * @property {function(number): void} setInterval - Update polling interval
 * @property {function(): boolean} isRunning - Check if polling is active
 */

/**
 * Creates a polling manager
 * @param {function(): Promise<void>} callback - Async function to call on each poll
 * @param {number} intervalMs - Initial polling interval in milliseconds
 * @returns {PollingManager}
 */
export function createPollingManager(callback, intervalMs) {
  let timerId = null;
  let currentInterval = intervalMs;
  let isActive = false;
  
  async function poll() {
    if (!isActive) return;
    
    try {
      await callback();
    } catch (err) {
      console.error('[Polling] Error:', err);
    }
    
    if (isActive) {
      timerId = setTimeout(poll, currentInterval);
    }
  }
  
  return {
    start() {
      if (isActive) return;
      isActive = true;
      // Start immediately, then continue at interval
      poll();
    },
    
    stop() {
      isActive = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    
    setInterval(ms) {
      currentInterval = ms;
      // If running, restart with new interval
      if (isActive) {
        this.stop();
        this.start();
      }
    },
    
    isRunning() {
      return isActive;
    }
  };
}


