'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../src/calculator');

const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof calc.CalculatorError && e.code === code);

test('add', () => {
  assert.equal(calc.add(2, 3), 5);
  assert.equal(calc.add(-2, -3), -5);
  assert.equal(calc.add(-2, 2), 0);
  assert.equal(calc.add(0, 0), 0);
  assert.equal(calc.add(0.1, 0.2), 0.3);
  assert.equal(calc.add(1e15, 1), 1000000000000001);
  assert.equal(calc.add(1.5, 2.25), 3.75);
});

test('add overflow', () => {
  throwsCode(() => calc.add(Number.MAX_VALUE, Number.MAX_VALUE), 'OVERFLOW');
});

test('subtract', () => {
  assert.equal(calc.subtract(5, 3), 2);
  assert.equal(calc.subtract(3, 5), -2);
  assert.equal(calc.subtract(0.3, 0.1), 0.2);
  assert.equal(calc.subtract(5, 5), 0);
  assert.equal(calc.subtract(-5, -5), 0);
  assert.ok(!Object.is(calc.subtract(-0.1, -0.1), -0), 'no negative zero');
  throwsCode(() => calc.subtract(-Number.MAX_VALUE, Number.MAX_VALUE), 'OVERFLOW');
});

test('multiply', () => {
  assert.equal(calc.multiply(4, 5), 20);
  assert.equal(calc.multiply(-4, 5), -20);
  assert.equal(calc.multiply(-4, -5), 20);
  assert.equal(calc.multiply(0, 12345), 0);
  assert.ok(!Object.is(calc.multiply(0, -5), -0), 'no negative zero');
  assert.equal(calc.multiply(0.1, 3), 0.3);
  assert.equal(calc.multiply(1.1, 1.1), 1.21);
  throwsCode(() => calc.multiply(1e200, 1e200), 'OVERFLOW');
});

test('divide', () => {
  assert.equal(calc.divide(10, 2), 5);
  assert.equal(calc.divide(1, 3), 0.333333333333333);
  assert.equal(calc.divide(-9, 3), -3);
  assert.equal(calc.divide(-9, -3), 3);
  assert.equal(calc.divide(0, 5), 0);
  assert.equal(calc.divide(0.3, 0.1), 3);
  throwsCode(() => calc.divide(1, 0), 'DIVISION_BY_ZERO');
  throwsCode(() => calc.divide(0, 0), 'DIVISION_BY_ZERO');
  throwsCode(() => calc.divide(5, -0), 'DIVISION_BY_ZERO');
  throwsCode(() => calc.divide(1e308, 1e-10), 'OVERFLOW');
});

test('modulo', () => {
  assert.equal(calc.modulo(10, 3), 1);
  assert.equal(calc.modulo(-10, 3), -1, 'sign of dividend');
  assert.equal(calc.modulo(10, -3), 1);
  assert.equal(calc.modulo(6, 3), 0);
  assert.equal(calc.modulo(2, 5), 2);
  assert.equal(calc.modulo(5.5, 2), 1.5);
  assert.equal(calc.modulo(0.3, 0.1), 0, 'exact decimal remainder');
  assert.equal(calc.modulo(0, 7), 0);
  assert.equal(calc.modulo(1e20, 3), calc.clean(1e20 % 3), 'large values fall back');
  assert.equal(calc.modulo(1.123456789012345678, 0.5), calc.clean(1.123456789012345678 % 0.5));
  throwsCode(() => calc.modulo(5, 0), 'DIVISION_BY_ZERO');
});

test('power', () => {
  assert.equal(calc.power(2, 10), 1024);
  assert.equal(calc.power(2, -2), 0.25);
  assert.equal(calc.power(9, 0.5), 3);
  assert.equal(calc.power(-2, 3), -8);
  assert.equal(calc.power(-2, 2), 4);
  assert.equal(calc.power(5, 0), 1);
  assert.equal(calc.power(0, 0), 1);
  assert.equal(calc.power(0, 5), 0);
  assert.equal(calc.power(-5, 0), 1);
  assert.equal(calc.power(1, 1e9), 1);
  throwsCode(() => calc.power(0, -1), 'DIVISION_BY_ZERO');
  throwsCode(() => calc.power(-8, 1 / 3), 'UNDEFINED');
  throwsCode(() => calc.power(10, 400), 'OVERFLOW');
});

test('sqrt', () => {
  assert.equal(calc.sqrt(16), 4);
  assert.equal(calc.sqrt(0), 0);
  assert.equal(calc.sqrt(2), 1.4142135623731);
  assert.equal(calc.sqrt(0.25), 0.5);
  throwsCode(() => calc.sqrt(-1), 'UNDEFINED');
});

test('toNumber validation', () => {
  assert.equal(calc.toNumber('  42 '), 42);
  assert.equal(calc.toNumber('1e3'), 1000);
  assert.equal(calc.toNumber('-0'), 0);
  assert.ok(!Object.is(calc.toNumber(-0), -0));
  for (const bad of [undefined, null, '', '   ', 'abc', '12abc', NaN, Infinity, -Infinity, 'Infinity', {}, [], true, [1]]) {
    throwsCode(() => calc.toNumber(bad), 'INVALID_OPERAND');
  }
});

test('calculate dispatcher', () => {
  assert.equal(calc.calculate('add', '2', 3), 5);
  assert.equal(calc.calculate('subtract', 5, 8), -3);
  assert.equal(calc.calculate('multiply', 3, 4), 12);
  assert.equal(calc.calculate('divide', 8, 4), 2);
  assert.equal(calc.calculate('modulo', 8, 5), 3);
  assert.equal(calc.calculate('power', 2, 3), 8);
  assert.equal(calc.calculate('sqrt', 9), 3);
  assert.equal(calc.calculate('sqrt', 9, 'ignored-garbage'), 3, 'unary ignores b');
  throwsCode(() => calc.calculate('add', 1), 'INVALID_OPERAND');
  throwsCode(() => calc.calculate('add', 'x', 1), 'INVALID_OPERAND');
  throwsCode(() => calc.calculate('nope', 1, 2), 'UNKNOWN_OPERATION');
  throwsCode(() => calc.calculate(undefined, 1, 2), 'UNKNOWN_OPERATION');
  throwsCode(() => calc.calculate('__proto__', 1, 2), 'UNKNOWN_OPERATION');
  throwsCode(() => calc.calculate('toString', 1, 2), 'UNKNOWN_OPERATION');
  throwsCode(() => calc.calculate('constructor', 1, 2), 'UNKNOWN_OPERATION');
});

test('clean normalises zero and noise', () => {
  assert.equal(calc.clean(0.1 + 0.2), 0.3);
  assert.ok(!Object.is(calc.clean(-0), -0));
  throwsCode(() => calc.clean(Infinity), 'OVERFLOW');
  throwsCode(() => calc.clean(NaN), 'OVERFLOW');
});
