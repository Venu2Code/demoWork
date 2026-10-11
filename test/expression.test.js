'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, tokenize } = require('../src/expression');
const { CalculatorError } = require('../src/calculator');

const ok = (expr, expected) => assert.equal(evaluate(expr), expected, expr);
const fails = (expr, code) =>
  assert.throws(() => evaluate(expr), (e) => e instanceof CalculatorError && e.code === code, expr);

test('basic arithmetic', () => {
  ok('1+2', 3);
  ok('5-8', -3);
  ok('4*5', 20);
  ok('20/4', 5);
  ok('10%3', 1);
  ok('2^8', 256);
  ok('  7  ', 7);
  ok('0.1+0.2', 0.3);
  ok('.5+.5', 1);
  ok('5.+1', 6);
  ok('1e3+1', 1001);
  ok('2.5E-1*4', 1);
});

test('operator precedence and associativity', () => {
  ok('2+3*4', 14);
  ok('(2+3)*4', 20);
  ok('10-2-3', 5, 'left assoc');
  ok('100/10/5', 2);
  ok('2^3^2', 512, 'right assoc');
  ok('-2^2', -4);
  ok('(-2)^2', 4);
  ok('2*3%4', 2);
  ok('2^-1', 0.5);
  ok('2*-3', -6);
});

test('unary operators', () => {
  ok('-5', -5);
  ok('+5', 5);
  ok('--5', 5);
  ok('-+-5', 5);
  ok('3--2', 5);
  ok('3+-2', 1);
  ok('-(2+3)', -5);
  ok('-0', 0);
});

test('sqrt function and unicode operators', () => {
  ok('sqrt(16)', 4);
  ok('sqrt(9)+1', 4);
  ok('sqrt(sqrt(16))', 2);
  ok('2*sqrt(4)', 4);
  ok('6×7', 42);
  ok('8÷2', 4);
  ok('9−4', 5);
});

test('nesting', () => {
  ok('((((1+2))))', 3);
  ok('(1+(2*(3+(4-1))))', 13);
  ok('2*(3+4)*(5-1)', 56);
});

test('mathematical errors propagate', () => {
  fails('1/0', 'DIVISION_BY_ZERO');
  fails('5%0', 'DIVISION_BY_ZERO');
  fails('1/(2-2)', 'DIVISION_BY_ZERO');
  fails('0^-1', 'DIVISION_BY_ZERO');
  fails('sqrt(-4)', 'UNDEFINED');
  fails('(-8)^0.5', 'UNDEFINED');
  fails('10^400', 'OVERFLOW');
  fails('9^9^9', 'OVERFLOW');
});

test('syntax errors', () => {
  for (const e of ['', '   ', '+', '*2', '2*', '2**3', '2++', '()', '(2', '2)', '(2))', '2 3', '1..2', '1.2.3',
    '2+', 'abc', '2+a', 'sqrt', 'sqrt 4', 'sqrt()', '1,5', '2 ^', '^2', '1e', '.', '$5', '2=2', '1 + 2 )']) {
    fails(e, 'SYNTAX_ERROR');
  }
});

test('input type and size limits', () => {
  for (const bad of [undefined, null, 5, {}, [], true]) fails(bad, 'SYNTAX_ERROR');
  fails('1+'.repeat(150) + '1', 'SYNTAX_ERROR');
  ok(Array(50).fill('1').join('+'), 50);
  fails('('.repeat(60) + '1' + ')'.repeat(60), 'SYNTAX_ERROR');
  fails('-'.repeat(60) + '1', 'SYNTAX_ERROR');
  fails('2^'.repeat(60) + '1', 'SYNTAX_ERROR');
});

test('no code execution', () => {
  fails('process.exit()', 'SYNTAX_ERROR');
  fails('constructor', 'SYNTAX_ERROR');
  fails('1;2', 'SYNTAX_ERROR');
});

test('tokenizer', () => {
  assert.deepEqual(tokenize('1+2'), [
    { type: 'num', value: 1 },
    { type: 'op', value: '+' },
    { type: 'num', value: 2 },
  ]);
  assert.deepEqual(tokenize(' sqrt ( 4 ) ').map((t) => t.value), ['sqrt', '(', 4, ')']);
});
