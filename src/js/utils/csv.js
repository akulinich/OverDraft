/**
 * CSV parsing utilities
 */

/**
 * Parses CSV text into 2D array
 * Handles quoted fields with commas and newlines
 * @param {string} csv - Raw CSV text
 * @returns {string[][]}
 */
export function parseCSV(csv) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // Skip next quote
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // Skip carriage return
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        // Keep all rows including empty ones to preserve row indices
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  
  // Don't forget the last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }
  
  return rows;
}

/**
 * Converts 2D array to CSV string
 * @param {string[][]} data - 2D array of values
 * @returns {string}
 */
export function toCSV(data) {
  return data.map(row => 
    row.map(field => {
      // Quote fields that contain comma, quote, or newline
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    }).join(',')
  ).join('\n');
}

