// Safe math expression compiler for plot_function. No eval: a small recursive-descent parser.
// Supports + - * / ^, parentheses, implicit multiplication (2x, 3sin(x), (x+1)(x-1)),
// x, pi, e, and sin cos tan asin acos atan sqrt abs ln log exp floor ceil.
// Accepts an optional "y =" or "f(x) =" prefix.

type Fn = (x: number) => number;

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, floor: Math.floor, ceil: Math.ceil,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/i.exec(src.slice(i)) ?? /^[0-9]+\.?/.exec(src.slice(i));
      out.push({ t: 'num', v: Number(m![0]) });
      i += m![0].length;
    } else if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(src.slice(i))!;
      // Split runs like "xsin" or "2pix" into known names greedily.
      let word = m[0].toLowerCase();
      i += m[0].length;
      while (word) {
        const name = [...Object.keys(FUNCS), ...Object.keys(CONSTS), 'x'].sort((a, b) => b.length - a.length).find((n) => word.startsWith(n));
        if (!name) throw new Error(`Unknown name "${word}"`);
        out.push({ t: 'id', v: name });
        word = word.slice(name.length);
      }
    } else if ('+-*/^()'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else {
      throw new Error(`Unexpected "${c}"`);
    }
  }
  return out;
}

export function compileExpression(source: string): Fn {
  const src = source.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '').replace(/\*\*/g, '^').replace(/·|×/g, '*');
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const startsFactor = () => {
    const t = peek();
    return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '('));
  };

  // expr := term (('+'|'-') term)*
  function expr(): Fn {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++]!.v;
      const l = left, r = term();
      left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }
  // term := unary (('*'|'/'|implicit) unary)*
  function term(): Fn {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = tokens[pos++]!.v;
        const l = left, r = unary();
        left = op === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (startsFactor()) {
        const l = left, r = power();
        left = (x) => l(x) * r(x);
      } else return left;
    }
  }
  // unary := '-' unary | power
  function unary(): Fn {
    if (isOp('-')) { pos++; const u = unary(); return (x) => -u(x); }
    if (isOp('+')) { pos++; return unary(); }
    return power();
  }
  // power := atom ('^' unary)?   (right-associative)
  function power(): Fn {
    const base = atom();
    if (isOp('^')) { pos++; const exp = unary(); return (x) => Math.pow(base(x), exp(x)); }
    return base;
  }
  function atom(): Fn {
    const t = tokens[pos++];
    if (!t) throw new Error('Unexpected end of expression');
    if (t.t === 'num') { const v = t.v; return () => v; }
    if (t.t === 'op' && t.v === '(') {
      const inner = expr();
      if (!isOp(')')) throw new Error('Missing ")"');
      pos++;
      return inner;
    }
    if (t.t === 'id') {
      if (t.v === 'x') return (x) => x;
      if (t.v in CONSTS) { const v = CONSTS[t.v]!; return () => v; }
      const f = FUNCS[t.v]!;
      const arg = isOp('(') ? atom() : power(); // sin(x) or sin x
      return (x) => f(arg(x));
    }
    throw new Error(`Unexpected "${t.v}"`);
  }

  const fn = expr();
  if (pos < tokens.length) throw new Error(`Unexpected "${(tokens[pos] as Token).v}"`);
  return fn;
}
