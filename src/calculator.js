'use strict';

/** Error raised for any invalid calculator input or undefined mathematical result. */
class CalculatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CalculatorError';
    this.code = code;
  }
}

const MAX_DECIMALS = 15;

/** Parse a number or numeric string into a finite number, else throw. */
function toNumber(value, label = 'operand') {
  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value.trim());
  } else {
    throw new CalculatorError('INVALID_OPERAND', `${label} must be a number`);
  }
  if (!Number.isFinite(n)) {
    throw new CalculatorError('INVALID_OPERAND', `${label} must be a finite number`);
  }
  return Object.is(n, -0) ? 0 : n;
}

/** Remove binary floating point noise (0.1 + 0.2 -> 0.3) and guard overflow. */
function clean(n) {
  if (!Number.isFinite(n)) {
    throw new CalculatorError('OVERFLOW', 'Result is too large');
  }
  const r = Number.isInteger(n) ? n : Number(n.toPrecision(15));
  return Object.is(r, -0) || r === 0 ? 0 : r;
}

/** Number of digits after the decimal point in the shortest representation. */
function decimalPlaces(n) {
  const [mantissa, exp = '0'] = String(n).toLowerCase().split('e');
  const frac = (mantissa.split('.')[1] || '').length;
  return Math.max(0, frac - Number(exp));
}

const add = (a, b) => clean(a + b);
const subtract = (a, b) => clean(a - b);
const multiply = (a, b) => clean(a * b);

function divide(a, b) {
  if (b === 0) throw new CalculatorError('DIVISION_BY_ZERO', 'Cannot divide by zero');
  return clean(a / b);
}

/** Remainder with the sign of the dividend (like JS %), exact for decimals. */
function modulo(a, b) {
  if (b === 0) throw new CalculatorError('DIVISION_BY_ZERO', 'Cannot take modulo by zero');
  const places = Math.max(decimalPlaces(a), decimalPlaces(b));
  if (places > 0 && places <= MAX_DECIMALS) {
    const scale = 10 ** places;
    const sa = Math.round(a * scale);
    const sb = Math.round(b * scale);
    if (Number.isSafeInteger(sa) && Number.isSafeInteger(sb)) {
      return clean((sa % sb) / scale);
    }
  }
  return clean(a % b);
}

function power(a, b) {
  if (a === 0 && b < 0) {
    throw new CalculatorError('DIVISION_BY_ZERO', 'Zero cannot be raised to a negative power');
  }
  if (a < 0 && !Number.isInteger(b)) {
    throw new CalculatorError('UNDEFINED', 'Negative base with fractional exponent is not a real number');
  }
  return clean(a ** b);
}

function sqrt(a) {
  if (a < 0) throw new CalculatorError('UNDEFINED', 'Square root of a negative number is not real');
  return clean(Math.sqrt(a));
}

const BINARY = { add, subtract, multiply, divide, modulo, power };
const UNARY = { sqrt };

const OPERATIONS = [...Object.keys(BINARY), ...Object.keys(UNARY)];

/** Validate operands and run a named operation. */
function calculate(operation, a, b) {
  if (typeof operation !== 'string' || !OPERATIONS.includes(operation)) {
    throw new CalculatorError('UNKNOWN_OPERATION', `Unknown operation: ${String(operation)}`);
  }
  const x = toNumber(a, 'a');
  if (operation in UNARY) return UNARY[operation](x);
  const y = toNumber(b, 'b');
  return BINARY[operation](x, y);
}

module.exports = { CalculatorError, calculate, toNumber, clean, OPERATIONS, ...BINARY, ...UNARY };
