/**
 * Line patches for a piece of HTML.
 *
 * The AI never returns the page. The piece the user selected is cut into numbered lines and
 * the AI answers with small operations on those numbers:
 *   remove  : delete lines FROM..TO
 *   add     : put new code after line N (0 = before line 1)
 *   replace : delete lines FROM..TO and put new code in their place (remove + add)
 * Every line the AI does not mention is kept exactly as it was.
 */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "param"]);

const TOKEN = /<!--[\s\S]*?-->|<(style|script)\b(?:"[^"]*"|'[^']*'|[^>"'])*>[\s\S]*?<\/\1\s*>|<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:"[^"]*"|'[^']*'|[^>"'])*>|[^<]+|</gi;

function classify(text) {
  if (text.startsWith("<!--") || /^<(style|script)\b/i.test(text)) return { text, kind: "raw", tag: "" };
  const close = /^<\/([a-zA-Z][a-zA-Z0-9:-]*)/.exec(text);
  if (close) return { text, kind: "close", tag: close[1].toLowerCase() };
  const open = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(text);
  if (open) {
    const tag = open[1].toLowerCase();
    return { text, kind: VOID.has(tag) || /\/>$/.test(text) ? "void" : "open", tag };
  }
  return { text, kind: "text", tag: "" };
}

function tokens(html) {
  return [...String(html || "").matchAll(TOKEN)].map((match) => classify(match[0]));
}

/**
 * Cut html into lines. A line is one tag, one run of words, or a small element written on
 * one line (<h2>Title</h2>). Joining every line's text gives back the original html exactly.
 */
function splitLines(html) {
  const list = tokens(html);
  const lines = [];
  let lead = "";
  const push = (text, kind) => {
    lines.push({ text: lead + text, kind });
    lead = "";
  };
  for (let i = 0; i < list.length; i += 1) {
    const token = list[i];
    if (token.kind === "text" && !token.text.trim()) {
      if (lines.length) lines[lines.length - 1].text += token.text;
      else lead += token.text;
      continue;
    }
    if (token.kind === "open") {
      const next = list[i + 1];
      const after = list[i + 2];
      if (next && next.kind === "close" && next.tag === token.tag) {
        push(token.text + next.text, "leaf");
        i += 1;
        continue;
      }
      if (next && next.kind === "text" && after && after.kind === "close" && after.tag === token.tag) {
        push(token.text + next.text + after.text, "leaf");
        i += 2;
        continue;
      }
    }
    push(token.text, token.kind === "open" || token.kind === "close" ? token.kind : "leaf");
  }
  return lines;
}

/** "1| <section ...>" style listing for the AI. Indentation is for reading only. */
function numberLines(lines) {
  let depth = 0;
  return lines.map((line, index) => {
    if (line.kind === "close") depth = Math.max(0, depth - 1);
    const shown = line.text.replace(/\s+/g, " ").trim();
    const row = `${index + 1}| ${"  ".repeat(Math.min(depth, 12))}${shown}`;
    if (line.kind === "open") depth += 1;
    return row;
  }).join("\n");
}

function isBalanced(html) {
  const stack = [];
  for (const token of tokens(html)) {
    if (token.kind === "open") stack.push(token.tag);
    else if (token.kind === "close") {
      if (stack.pop() !== token.tag) return false;
    }
  }
  return stack.length === 0;
}

function cleanNewCode(value) {
  let code = String(value == null ? "" : value).trim();
  code = code.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  code = code.replace(/\sdata-sclad-[a-z-]+\s*=\s*(["'])[\s\S]*?\1/gi, "");
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(code)) {
    throw new Error("New code must be a part of the page, not the whole page.");
  }
  return code;
}

function whole(value, what) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${what} must be a line number.`);
  return number;
}

/** Check the AI's operations and turn them into a plain list. Throws a message the AI can act on. */
function normalizeOps(rawOps, lineCount) {
  if (!Array.isArray(rawOps)) throw new Error("\"ops\" must be a list.");
  const ops = rawOps.map((raw, index) => {
    const name = String(raw?.op || "").toLowerCase();
    const where = `Operation ${index + 1}`;
    if (name === "remove" || name === "replace") {
      const from = whole(raw.from, `${where} "from"`);
      const to = raw.to === undefined ? from : whole(raw.to, `${where} "to"`);
      if (from < 1 || to < from || to > lineCount) {
        throw new Error(`${where}: lines ${from}-${to} are not inside 1-${lineCount}.`);
      }
      if (name === "remove") return { op: "remove", from, to };
      const html = cleanNewCode(raw.html);
      if (!html) throw new Error(`${where}: replace needs "html". Use remove to only delete.`);
      return { op: "replace", from, to, html };
    }
    if (name === "add") {
      const after = raw.after !== undefined ? whole(raw.after, `${where} "after"`)
        : raw.before !== undefined ? whole(raw.before, `${where} "before"`) - 1
          : NaN;
      if (!Number.isInteger(after) || after < 0 || after > lineCount) {
        throw new Error(`${where}: "after" must be from 0 to ${lineCount}.`);
      }
      const html = cleanNewCode(raw.html);
      if (!html) throw new Error(`${where}: add needs "html".`);
      return { op: "add", after, html };
    }
    throw new Error(`${where}: "op" must be remove, add or replace.`);
  });

  const spans = ops.filter((op) => op.op !== "add").sort((a, b) => a.from - b.from);
  for (let i = 1; i < spans.length; i += 1) {
    if (spans[i].from <= spans[i - 1].to) throw new Error("Operations must not overlap.");
  }
  for (const op of ops) {
    if (op.op !== "add") continue;
    const inside = spans.find((span) => op.after >= span.from && op.after < span.to);
    if (inside) throw new Error(`An add after line ${op.after} falls inside lines ${inside.from}-${inside.to}, which are being removed.`);
  }
  return ops;
}

/** Apply the operations to the lines. Returns the new html and a short, readable summary. */
function applyOps(lines, rawOps) {
  const ops = normalizeOps(rawOps, lines.length);
  const dropped = new Set();
  const swapAt = new Map();
  const addAfter = new Map();
  for (const op of ops) {
    if (op.op === "add") {
      addAfter.set(op.after, [...(addAfter.get(op.after) || []), op.html]);
      continue;
    }
    for (let k = op.from; k <= op.to; k += 1) dropped.add(k);
    if (op.op === "replace") swapAt.set(op.from, op.html);
  }
  const out = [];
  const put = (html) => out.push(`${html}\n`);
  (addAfter.get(0) || []).forEach(put);
  lines.forEach((line, index) => {
    const number = index + 1;
    if (swapAt.has(number)) put(swapAt.get(number));
    if (!dropped.has(number)) out.push(line.text);
    (addAfter.get(number) || []).forEach(put);
  });
  const changes = ops.map((op) => {
    if (op.op === "remove") return { op: "remove", from: op.from, to: op.to };
    if (op.op === "add") return { op: "add", after: op.after, html: op.html.slice(0, 200) };
    return { op: "replace", from: op.from, to: op.to, html: op.html.slice(0, 200) };
  });
  return { html: out.join(""), changes };
}

module.exports = { splitLines, numberLines, applyOps, normalizeOps, isBalanced, cleanNewCode };
