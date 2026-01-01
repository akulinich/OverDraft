/**
 * Polling manager for periodic data fetching
 * Automatically pauses when tab is hidden to save resources
 */

/**
 * @typedef {Object} PollingManager
 * @property {function(): void} start - Start polling
 * @property {function(): void} stop - Stop polling
 * @property {function(number): void} setInterval - Update polling interval
 * @property {function(): boolean} isRunning - Check if polling is active
 * @property {function(): void} destroy - Cleanup and remove event listeners
 */

/**
 * Creates a polling manager with visibility-based pause/resume
 * @param {function(): Promise<void>} callback - Async function to call on each poll
 * @param {number} intervalMs - Initial polling interval in milliseconds
 * @returns {PollingManager}
 */
export function createPollingManager(callback, intervalMs) {
  let timerId = null;
  let currentInterval = intervalMs;
  let isActive = false;
  let wasRunningBeforeHide = false;
  let isPolling = false;  // Guard against concurrent execution
  
  async function poll() {
    console.log('[Polling] poll() called, isActive:', isActive, 'visibility:', document.visibilityState, 'isPolling:', isPolling);
    
    // Skip if not active or tab is hidden
    if (!isActive || document.visibilityState === 'hidden') return;
    
    // Prevent concurrent execution
    if (isPolling) {
      console.log('[Polling] Skipped - already polling');
      return;
    }
    
    isPolling = true;
    console.log('[Polling] Starting callback...');
    try {
      await callback();
    } catch (err) {
      console.error('[Polling] Error:', err);
    } finally {
      isPolling = false;
      console.log('[Polling] Callback finished');
    }
    
    // Schedule next poll only if still active and visible
    if (isActive && document.visibilityState === 'visible') {
      console.log('[Polling] Scheduling next poll in', currentInterval, 'ms');
      timerId = setTimeout(poll, currentInterval);
    }
  }
  
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // Tab became visible - resume polling if it was active
      if (wasRunningBeforeHide && isActive) {
        poll(); // Immediate fetch + restart timer
      }
    } else {
      // Tab hidden - stop timer but keep isActive flag
      wasRunningBeforeHide = isActive;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }
  }
  
  // Listen for visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  return {
    start() {
      if (isActive) return;
      isActive = true;
      wasRunningBeforeHide = true;
      // Schedule first poll after interval (don't fetch immediately to avoid duplicate with init)
      if (document.visibilityState === 'visible') {
        timerId = setTimeout(poll, currentInterval);
      }
    },
    
    stop() {
      isActive = false;
      wasRunningBeforeHide = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    
    setInterval(ms) {
      currentInterval = ms;
      // Restart with new interval if running and visible
      if (isActive && document.visibilityState === 'visible') {
        if (timerId !== null) {
          clearTimeout(timerId);
        }
        timerId = setTimeout(poll, currentInterval);
      }
    },
    
    isRunning() {
      return isActive;
    },
    
    destroy() {
      this.stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}
