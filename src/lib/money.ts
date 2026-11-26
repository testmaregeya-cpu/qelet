/**
 * Integer-santim monetary helpers for Ethiopian Birr (ETB).
 * 1 ETB = 100 santim. Quantities use integer milli-units (1 unit = 1000 milli).
 * All calculations MUST use integer arithmetic to avoid floating-point drift.
 */

export const SANTIM_PER_ETB = 100;
export const MILLI_PER_UNIT = 1000;

export function assertIntegerSantim(santim: number, fieldName = 'amount'): number {
  if (!Number.isSafeInteger(santim)) {
    throw new Error(`${fieldName} must be a safe integer number of santim`);
  }
  return santim;
}

/**
 * Parses a human-entered ETB amount string (e.g. "125", "125.5", "125.50")
 * into exact integer santim without floating-point multiplication errors.
 */
export function parseEtbToSantim(rawInput: string): number {
  const trimmed = rawInput.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a valid ETB amount with at most 2 decimal places');
  }

  const [wholePart, fracPart = ''] = trimmed.split('.');
  const birr = Number.parseInt(wholePart, 10);
  const santim = Number.parseInt(fracPart.padEnd(2, '0'), 10);
  const total = birr * SANTIM_PER_ETB + santim;

  if (!Number.isSafeInteger(total)) {
    throw new Error('Amount is too large');
  }

  return total;
}

/**
 * Parses a positive decimal quantity string (e.g. "1", "2.5", "0.25")
 * into integer milli-units (up to 3 decimal places).
 */
export function parseQuantityToMilli(rawInput: string): number {
  const trimmed = rawInput.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    throw new Error('Enter a valid quantity with at most 3 decimal places');
  }

  const [wholePart, fracPart = ''] = trimmed.split('.');
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(3, '0'), 10);
  const total = whole * MILLI_PER_UNIT + frac;

  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new Error('Quantity must be greater than 0');
  }

  return total;
}

export function formatQuantityMilli(quantityMilli: number): string {
  assertIntegerSantim(quantityMilli, 'quantityMilli');
  const whole = Math.floor(quantityMilli / MILLI_PER_UNIT);
  const frac = quantityMilli % MILLI_PER_UNIT;
  if (frac === 0) {
    return String(whole);
  }
  const trimmedFrac = String(frac).padStart(3, '0').replace(/0+$/, '');
  return `${whole}.${trimmedFrac}`;
}

/**
 * Computes line total in exact integer santim:
 * round((quantityMilli * unitPriceSantim) / 1000)
 */
export function computeLineTotalSantim(quantityMilli: number, unitPriceSantim: number): number {
  assertIntegerSantim(quantityMilli, 'quantityMilli');
  assertIntegerSantim(unitPriceSantim, 'unitPriceSantim');
  if (quantityMilli <= 0) {
    throw new Error('Quantity must be greater than 0');
  }
  if (unitPriceSantim < 0) {
    throw new Error('Unit price cannot be negative');
  }
  return Math.round((quantityMilli * unitPriceSantim) / MILLI_PER_UNIT);
}

/**
 * Formats integer santim into readable ETB text.
 * Examples:
 * - 0 -> "0 ETB"
 * - 125000 -> "1,250 ETB"
 * - 125050 -> "1,250.50 ETB"
 */
export function formatEtb(santim: number, options?: { alwaysShowDecimals?: boolean }): string {
  assertIntegerSantim(santim);

  const isNegative = santim < 0;
  const abs = Math.abs(santim);
  const whole = Math.floor(abs / SANTIM_PER_ETB);
  const remainder = abs % SANTIM_PER_ETB;

  const formattedWhole = whole.toLocaleString('en-US');
  const showDecimals = options?.alwaysShowDecimals || remainder !== 0;
  const decimalPart = showDecimals ? `.${String(remainder).padStart(2, '0')}` : '';

  return `${isNegative ? '-' : ''}${formattedWhole}${decimalPart} ETB`;
}

/**
 * Formats integer santim as plain decimal text for editing inside TextInput.
 */
export function formatSantimForInput(santim: number): string {
  assertIntegerSantim(santim);
  const whole = Math.floor(santim / SANTIM_PER_ETB);
  const remainder = santim % SANTIM_PER_ETB;
  if (remainder === 0) {
    return String(whole);
  }
  return `${whole}.${String(remainder).padStart(2, '0')}`;
}
