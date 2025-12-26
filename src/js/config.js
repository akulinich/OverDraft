/**
 * Application configuration constants
 */
export const config = {
  // Polling settings
  defaultPollingInterval: 1000,
  minPollingInterval: 500,
  maxPollingInterval: 5000,
  
  // Sheet limits
  maxSheets: 10,
  
  // API settings
  gvizBaseUrl: 'https://docs.google.com/spreadsheets/d',
  
  // Development mode
  isDev: import.meta.env.DEV
};


