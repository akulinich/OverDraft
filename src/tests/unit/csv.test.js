import { describe, it, expect } from 'vitest';
import { parseCSV, toCSV } from '../../js/utils/csv.js';

describe('parseCSV', () => {
  it('parses simple CSV', () => {
    const csv = 'a,b,c\n1,2,3';
    const result = parseCSV(csv);
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,heroes\nPlayer1,"Tracer, Genji"';
    const result = parseCSV(csv);
    expect(result[1][1]).toBe('Tracer, Genji');
  });

  it('handles quoted fields with quotes inside', () => {
    const csv = 'name,note\nPlayer1,"Said ""hello"" to me"';
    const result = parseCSV(csv);
    expect(result[1][1]).toBe('Said "hello" to me');
  });

  it('handles quoted fields with newlines', () => {
    const csv = 'name,bio\nPlayer1,"Line 1\nLine 2"';
    const result = parseCSV(csv);
    expect(result[1][1]).toBe('Line 1\nLine 2');
  });

  it('handles Windows line endings (CRLF)', () => {
    const csv = 'a,b,c\r\n1,2,3';
    const result = parseCSV(csv);
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('handles single value', () => {
    expect(parseCSV('value')).toEqual([['value']]);
  });

  it('trims whitespace from fields', () => {
    const csv = '  a  ,  b  \n  1  ,  2  ';
    const result = parseCSV(csv);
    expect(result).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles empty fields', () => {
    const csv = 'a,,c\n,2,';
    const result = parseCSV(csv);
    expect(result).toEqual([['a', '', 'c'], ['', '2', '']]);
  });

  it('handles multiple rows', () => {
    const csv = 'h1,h2\nv1,v2\nv3,v4\nv5,v6';
    const result = parseCSV(csv);
    expect(result.length).toBe(4);
  });
});

describe('toCSV', () => {
  it('converts simple 2D array to CSV', () => {
    const data = [['a', 'b', 'c'], ['1', '2', '3']];
    const result = toCSV(data);
    expect(result).toBe('a,b,c\n1,2,3');
  });

  it('quotes fields containing commas', () => {
    const data = [['name', 'heroes'], ['Player1', 'Tracer, Genji']];
    const result = toCSV(data);
    expect(result).toBe('name,heroes\nPlayer1,"Tracer, Genji"');
  });

  it('escapes quotes in fields', () => {
    const data = [['name', 'note'], ['Player1', 'Said "hello"']];
    const result = toCSV(data);
    expect(result).toBe('name,note\nPlayer1,"Said ""hello"""');
  });

  it('quotes fields containing newlines', () => {
    const data = [['name', 'bio'], ['Player1', 'Line 1\nLine 2']];
    const result = toCSV(data);
    expect(result).toBe('name,bio\nPlayer1,"Line 1\nLine 2"');
  });

  it('handles empty array', () => {
    expect(toCSV([])).toBe('');
  });
});

describe('parseCSV + toCSV round-trip', () => {
  it('preserves simple data', () => {
    const original = [['a', 'b', 'c'], ['1', '2', '3']];
    const csv = toCSV(original);
    const parsed = parseCSV(csv);
    expect(parsed).toEqual(original);
  });

  it('preserves data with special characters', () => {
    const original = [
      ['name', 'heroes', 'note'],
      ['Player1', 'Tracer, Genji', 'Said "hi"']
    ];
    const csv = toCSV(original);
    const parsed = parseCSV(csv);
    expect(parsed).toEqual(original);
  });
});





