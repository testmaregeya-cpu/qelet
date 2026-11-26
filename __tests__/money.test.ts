import {
  assertIntegerSantim,
  computeLineTotalSantim,
  formatEtb,
  formatQuantityMilli,
  formatSantimForInput,
  parseEtbToSantim,
  parseQuantityToMilli,
} from '../src/lib/money';

describe('ETB integer santim and quantity milli helpers', () => {
  test('parses valid ETB strings into exact integer santim without float drift', () => {
    expect(parseEtbToSantim('0')).toBe(0);
    expect(parseEtbToSantim('125')).toBe(12500);
    expect(parseEtbToSantim('125.5')).toBe(12550);
    expect(parseEtbToSantim('125.50')).toBe(12550);
    expect(parseEtbToSantim('1,250.75')).toBe(125075);

    const sum = parseEtbToSantim('0.10') + parseEtbToSantim('0.20');
    expect(sum).toBe(30);
    expect(formatEtb(sum)).toBe('0.30 ETB');
  });

  test('rejects invalid ETB inputs', () => {
    expect(() => parseEtbToSantim('')).toThrow();
    expect(() => parseEtbToSantim('-50')).toThrow();
    expect(() => parseEtbToSantim('10.123')).toThrow();
    expect(() => parseEtbToSantim('abc')).toThrow();
  });

  test('parses, formats, and multiplies fractional quantities accurately in integer santim', () => {
    expect(parseQuantityToMilli('1')).toBe(1000);
    expect(parseQuantityToMilli('0.5')).toBe(500);
    expect(parseQuantityToMilli('1.25')).toBe(1250);
    expect(parseQuantityToMilli('0.125')).toBe(125);
    expect(() => parseQuantityToMilli('0')).toThrow();
    expect(() => parseQuantityToMilli('-1')).toThrow();

    expect(formatQuantityMilli(1000)).toBe('1');
    expect(formatQuantityMilli(500)).toBe('0.5');
    expect(formatQuantityMilli(1250)).toBe('1.25');

    // 1.5 kg * 85.50 ETB = 128.25 ETB -> 12825 santim
    expect(computeLineTotalSantim(1500, 8550)).toBe(12825);
    // 0.25 kg * 120 ETB = 30 ETB -> 3000 santim
    expect(computeLineTotalSantim(250, 12000)).toBe(3000);
  });

  test('formats integer santim cleanly in ETB and for text input', () => {
    expect(formatEtb(0)).toBe('0 ETB');
    expect(formatEtb(0, { alwaysShowDecimals: true })).toBe('0.00 ETB');
    expect(formatEtb(125000)).toBe('1,250 ETB');
    expect(formatEtb(125050)).toBe('1,250.50 ETB');
    expect(formatEtb(-4500)).toBe('-45 ETB');

    expect(formatSantimForInput(125000)).toBe('1250');
    expect(formatSantimForInput(125050)).toBe('1250.50');
  });

  test('assertIntegerSantim rejects non-integer floats', () => {
    expect(assertIntegerSantim(100)).toBe(100);
    expect(() => assertIntegerSantim(12.34)).toThrow();
  });
});
