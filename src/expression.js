'use strict';

const calc = require('./calculator');
const { CalculatorError } = calc;

const MAX_LENGTH = 200;
const MAX_DEPTH = 50;

const OPS = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '%': 'modulo', '^': 'power' };

function syntax(message) {
  return new CalculatorError('SYNTAX_ERROR', message);
}

function tokenize(input) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(sqrt)|([-+*/%^()×÷−]))/y;
  let pos = 0;
  while (pos < input.length) {
    if (/^\s*$/.test(input.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(input);
    if (!m) throw syntax(`Unexpected character "${input.slice(pos).trim()[0]}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ type: 'num', value: Number(m[1]) });
    else if (m[2]) tokens.push({ type: 'fn', value: 'sqrt' });
    else {
      const v = { '×': '*', '÷': '/', '−': '-' }[m[3]] || m[3];
      tokens.push({ type: 'op', value: v });
    }
  }
  return tokens;
}

/**
 * Recursive descent parser/evaluator (no eval).
 *   expr   := term (('+'|'-') term)*
 *   term   := unary (('*'|'/'|'%') unary)*
 *   unary  := ('+'|'-') unary | power
 *   power  := primary ('^' unary)?          (right associative; -2^2 = -4)
 *   primary:= number | '(' expr ')' | 'sqrt' '(' expr ')'
 */
function evaluate(input) {
  if (typeof input !== 'string') throw syntax('Expression must be a string');
  if (input.length > MAX_LENGTH) throw syntax(`Expression too long (max ${MAX_LENGTH} characters)`);
  if (input.trim() === '') throw syntax('Expression is empty');

  const tokens = tokenize(input);
  let i = 0;
  let depth = 0;
  const peek = () => tokens[i];
  const isOp = (...vs) => peek() && peek().type === 'op' && vs.includes(peek().value);

  function enter() {
    if (++depth > MAX_DEPTH) throw syntax('Expression is nested too deeply');
  }

  function expr() {
    let left = term();
    while (isOp('+', '-')) {
      const op = tokens[i++].value;
      left = calc[OPS[op]](left, term());
    }
    return left;
  }

  function term() {
    let left = unary();
    while (isOp('*', '/', '%')) {
      const op = tokens[i++].value;
      left = calc[OPS[op]](left, unary());
    }
    return left;
  }

  function unary() {
    if (isOp('+', '-')) {
      const op = tokens[i++].value;
      enter();
      const v = unary();
      depth--;
      return op === '-' ? calc.subtract(0, v) : v;
    }
    return pow();
  }

  function pow() {
    const base = primary();
    if (isOp('^')) {
      i++;
      enter();
      const exp = unary();
      depth--;
      return calc.power(base, exp);
    }
    return base;
  }

  function primary() {
    const t = tokens[i++];
    if (!t) throw syntax('Unexpected end of expression');
    if (t.type === 'num') return calc.toNumber(t.value);
    if (t.type === 'fn') {
      if (!isOp('(')) throw syntax('Expected "(" after sqrt');
      return calc.sqrt(group());
    }
    if (t.type === 'op' && t.value === '(') {
      i--;
      return group();
    }
    throw syntax(`Unexpected "${t.value}"`);
  }

  function group() {
    i++; // consume '('
    enter();
    const v = expr();
    depth--;
    if (!isOp(')')) throw syntax('Missing closing parenthesis');
    i++;
    return v;
  }

  const result = expr();
  if (i < tokens.length) {
    throw syntax(isOp(')') ? 'Unmatched closing parenthesis' : `Unexpected "${tokens[i].value}"`);
  }
  return result;
}

module.exports = { evaluate, tokenize };
