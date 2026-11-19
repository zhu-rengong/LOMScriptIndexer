import { LOGIC_ALIAS, ROOTS } from "./fields";
import { QueryFail } from "./error";
import { isSpace } from "./scan";

export type Token = {
  type: string;
  value: string | number;
  at: number;
};

const OPERATORS: { prefix: string; type: string; value: string }[] = [
  { prefix: "&&", type: "op", value: "AND" },
  { prefix: "||", type: "op", value: "OR" },
  { prefix: "!=", type: "op", value: "!=" },
  { prefix: ">=", type: "op", value: ">=" },
  { prefix: "<=", type: "op", value: "<=" },
  { prefix: "\u2265", type: "op", value: ">=" },
  { prefix: "\u2264", type: "op", value: "<=" },
  { prefix: "!", type: "op", value: "NOT" },
  { prefix: ">", type: "op", value: ">" },
  { prefix: "<", type: "op", value: "<" },
  { prefix: "=", type: "op", value: "=" },
  { prefix: ":", type: "op", value: ":" },
  { prefix: ",", type: "comma", value: "," },
];

const isStop = (ch: string): boolean => isSpace(ch) || "()!:,=\"'<>".indexOf(ch) >= 0;

const readQuoted = (source: string, start: number): { value: string; end: number } => {
  const quote = source[start];
  let index = start + 1;
  let piece = "";
  while (index < source.length && source[index] !== quote) {
    if (source[index] === "\\" && index + 1 < source.length) {
      piece += source[index + 1];
      index += 2;
      continue;
    }
    piece += source[index++];
  }
  if (index >= source.length) throw new QueryFail("qErrQuote", start);
  return { value: piece, end: index + 1 };
};

export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (isSpace(ch)) {
      index++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: ch === "(" ? "lparen" : "rparen", value: ch, at: index });
      index++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quoted = readQuoted(source, index);
      tokens.push({ type: "string", value: quoted.value, at: index + 1 });
      index = quoted.end;
      continue;
    }
    const operator = OPERATORS.find((item) => source.startsWith(item.prefix, index));
    if (operator) {
      tokens.push({ type: operator.type, value: operator.value, at: index });
      index += operator.prefix.length;
      continue;
    }
    const from = index;
    while (index < source.length && !isStop(source[index])) index++;
    const word = source.slice(from, index);
    if (!word) throw new QueryFail("qErrChar", index, { ch });
    if (/^-?\d+(\.\d+)?$/.test(word))
      tokens.push({ type: "number", value: Number(word), at: from });
    else if (ROOTS.indexOf(word.toUpperCase()) >= 0) {
      tokens.push({ type: "op", value: word.toUpperCase(), at: from });
    } else if (LOGIC_ALIAS.has(word.toLowerCase())) {
      tokens.push({ type: "op", value: LOGIC_ALIAS.get(word.toLowerCase()) as string, at: from });
    } else tokens.push({ type: "ident", value: word, at: from });
  }
  tokens.push({ type: "eof", value: "", at: source.length });
  return tokens;
};
