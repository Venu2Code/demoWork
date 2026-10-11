# Calculator

Full-stack calculator with zero runtime dependencies (Node ≥ 20).

- **Backend** – `src/server.js` (REST API + static hosting), `src/calculator.js` (operations), `src/expression.js` (safe recursive-descent parser, no `eval`)
- **Frontend** – `public/` (vanilla JS, keyboard + on-screen keypad, history)
- **Tests** – `test/` using the built-in `node:test` runner

```bash
npm start            # http://localhost:3000  (PORT env var to change)
npm test
npm run coverage
```

## API

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/health` | – | `{status:"ok"}` |
| GET | `/api/operations` | – | `{operations:[...]}` |
| POST | `/api/calculate` | `{operation, a, b}` | `{result}` |
| POST | `/api/evaluate` | `{expression}` | `{result}` |

Operations: `add subtract multiply divide modulo power sqrt` (`sqrt` ignores `b`).
Errors return `400 {error:{code,message}}` with codes `DIVISION_BY_ZERO`, `UNDEFINED`, `OVERFLOW`, `INVALID_OPERAND`, `UNKNOWN_OPERATION`, `SYNTAX_ERROR`; also `404/405/413/415`.

## Edge-case behaviour

- Floating-point noise is removed: `0.1 + 0.2 = 0.3`, `0.3 % 0.1 = 0`; integers stay exact.
- `x / 0`, `x % 0`, `0 ^ negative` → `DIVISION_BY_ZERO`; `sqrt(-1)`, `(-8) ^ 0.5` → `UNDEFINED`; results beyond double range → `OVERFLOW`.
- `0 ^ 0 = 1`; `%` takes the sign of the dividend (`-10 % 3 = -1`); `-0` is normalised to `0`.
- Operands must be finite numbers or numeric strings; `NaN`, `Infinity`, empty strings, booleans, arrays, `null` are rejected.
- Expressions: `+ - * / % ^`, unary ±, parentheses, `sqrt(...)`, `×÷−`; `^` is right-associative and `-2^2 = -4`. Limits: 200 chars, nesting depth 50.
- Server: 10 KB body limit, JSON content-type required, path-traversal protection, CSP and `nosniff` headers.
