// Small, safe arithmetic evaluator for owner-defined metrics.
// Supports numbers, named variables, + - * / % ^, parentheses, unary minus,
// and a short list of functions. No property access, no calls into JS.

export type MetricVariables = Record<string, number>;

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  abs: (value) => Math.abs(value),
  round: (value, digits = 0) => {
    const factor = 10 ** Math.max(0, Math.floor(digits));
    return Math.round(value * factor) / factor;
  },
  floor: (value) => Math.floor(value),
  ceil: (value) => Math.ceil(value),
  sqrt: (value) => Math.sqrt(value),
  // safe division: returns 0 when the denominator is 0
  div: (a, b) => (b === 0 ? 0 : a / b),
  avg: (...args) => (args.length ? args.reduce((sum, value) => sum + value, 0) / args.length : 0),
  sum: (...args) => args.reduce((sum, value) => sum + value, 0),
};

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9._,]/.test(source[j])) j++;
      const raw = source.slice(i, j).replace(/[_,]/g, "");
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Bad number "${source.slice(i, j)}"`);
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      tokens.push({ type: "id", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    if (ch === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma" }); i++; continue; }
    throw new Error(`Unexpected character "${ch}"`);
  }
  return tokens;
}

export type ExpressionResult = { ok: true; value: number } | { ok: false; error: string };

export function evaluateExpression(source: string, variables: MetricVariables): ExpressionResult {
  try {
    const tokens = tokenize(source);
    if (!tokens.length) return { ok: false, error: "Empty expression" };
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    function parseExpression(): number {
      let left = parseTerm();
      while (peek() && peek().type === "op" && ["+", "-"].includes((peek() as { value: string }).value)) {
        const op = (next() as { value: string }).value;
        const right = parseTerm();
        left = op === "+" ? left + right : left - right;
      }
      return left;
    }
    function parseTerm(): number {
      let left = parseFactor();
      while (peek() && peek().type === "op" && ["*", "/", "%"].includes((peek() as { value: string }).value)) {
        const op = (next() as { value: string }).value;
        const right = parseFactor();
        if (op === "*") left = left * right;
        else if (op === "/") left = right === 0 ? 0 : left / right;
        else left = right === 0 ? 0 : left % right;
      }
      return left;
    }
    function parseFactor(): number {
      const base = parseUnary();
      if (peek() && peek().type === "op" && (peek() as { value: string }).value === "^") {
        next();
        const exponent = parseFactor();
        return base ** exponent;
      }
      return base;
    }
    function parseUnary(): number {
      const token = peek();
      if (token && token.type === "op" && token.value === "-") { next(); return -parseUnary(); }
      if (token && token.type === "op" && token.value === "+") { next(); return parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary(): number {
      const token = next();
      if (!token) throw new Error("Unexpected end of expression");
      if (token.type === "num") return token.value;
      if (token.type === "lparen") {
        const value = parseExpression();
        const close = next();
        if (!close || close.type !== "rparen") throw new Error("Missing closing parenthesis");
        return value;
      }
      if (token.type === "id") {
        const name = token.value;
        if (peek() && peek().type === "lparen") {
          next();
          const fn = FUNCTIONS[name.toLowerCase()];
          if (!fn) throw new Error(`Unknown function "${name}"`);
          const args: number[] = [];
          if (peek() && peek().type === "rparen") { next(); return fn(...args); }
          for (;;) {
            args.push(parseExpression());
            const separator = next();
            if (!separator) throw new Error("Missing closing parenthesis");
            if (separator.type === "rparen") break;
            if (separator.type !== "comma") throw new Error("Expected , or )");
          }
          return fn(...args);
        }
        if (!(name in variables)) throw new Error(`Unknown value "${name}"`);
        return variables[name];
      }
      throw new Error("Unexpected token");
    }

    const value = parseExpression();
    if (pos < tokens.length) throw new Error("Unexpected trailing input");
    if (!Number.isFinite(value)) return { ok: false, error: "Result is not a finite number" };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not evaluate" };
  }
}

export function expressionIdentifiers(source: string) {
  try {
    return [...new Set(tokenize(source).filter((token) => token.type === "id").map((token) => (token as { value: string }).value))]
      .filter((name) => !(name.toLowerCase() in FUNCTIONS));
  } catch {
    return [];
  }
}
