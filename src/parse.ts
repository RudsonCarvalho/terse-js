import { TerseError } from "./types";

const MAX_DEPTH = 64;

// §3.5 grammar — ASCII letters, underscore, dot, forward-slash
const SAFE_START_RE = /^[A-Za-z_./]/;

// safe-id: starts with safe-start, continues with safe-chars (no space!)
// sticky regex — set lastIndex before use
const SAFE_ID_RE = /[A-Za-z_.\/][A-Za-z0-9\-_./@]*/y;

// §4.3 — number grammar; sticky regex — set lastIndex before use
const NUMBER_RE = /-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

// ─── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  pos = 0;
  depth = 0;

  constructor(readonly src: string) {
    // §3.2 – tabs are forbidden everywhere in source
    const ti = src.indexOf("\t");
    if (ti !== -1)
      throw new TerseError(
        `Tab character (U+0009) is not allowed in TERSE at position ${ti}`,
        ti,
        "ILLEGAL_CHARACTER",
      );
  }

  // ── character helpers ──────────────────────────────────────────────────────

  cur(): string { return this.src[this.pos] ?? ""; }
  peek(n = 1): string { return this.src[this.pos + n] ?? ""; }
  eof(): boolean { return this.pos >= this.src.length; }

  /** Skip horizontal whitespace (spaces only). Does NOT skip newlines. */
  skipHws(): void {
    while (this.src[this.pos] === " ") this.pos++;
  }

  /** Skip spaces, \r, \n, and // comment lines. */
  skipWsLines(): void {
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\n" || ch === "\r") { this.pos++; continue; }
      if (ch === "/" && this.src[this.pos + 1] === "/") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
        continue;
      }
      break;
    }
  }

  expect(ch: string): void {
    if (this.src[this.pos] !== ch)
      throw new TerseError(
        `Expected '${ch}' at position ${this.pos}, got '${this.cur() || "EOF"}'`,
        this.pos,
        "UNEXPECTED_CHARACTER",
      );
    this.pos++;
  }

  /** Returns true if current position starts a key:value pair. Does not advance pos. */
  isKvStart(): boolean {
    const saved = this.pos;
    try {
      const ch = this.cur();
      if (ch === '"') {
        this.parseQuotedString();
      } else if (SAFE_START_RE.test(ch)) {
        SAFE_ID_RE.lastIndex = this.pos;
        const m = SAFE_ID_RE.exec(this.src);
        if (!m) return false;
        this.pos += m[0].length;
      } else {
        return false;
      }
      this.skipHws();
      return this.cur() === ':';
    } catch {
      return false;
    } finally {
      this.pos = saved;
    }
  }

  // ── number ─────────────────────────────────────────────────────────────────

  parseNumber(): number {
    NUMBER_RE.lastIndex = this.pos;
    const m = NUMBER_RE.exec(this.src);
    if (!m) throw new TerseError(`Expected number at ${this.pos}`, this.pos, "UNEXPECTED_CHARACTER");
    this.pos += m[0].length;
    return parseFloat(m[0]);
  }

  // ── quoted string ──────────────────────────────────────────────────────────

  parseQuotedString(): string {
    const start = this.pos;
    this.pos++; // skip opening "
    let r = "";
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === '"') { this.pos++; return r; }
      if (ch === "\\") {
        this.pos++;
        const esc = this.src[this.pos];
        switch (esc) {
          case '"':  r += '"';  break;
          case "\\": r += "\\"; break;
          case "n":  r += "\n"; break;
          case "r":  r += "\r"; break;
          case "t":  r += "\t"; break;
          case "b":  r += "\b"; break;
          case "f":  r += "\f"; break;
          case "u": {
            const hex = this.src.slice(this.pos + 1, this.pos + 5);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex))
              throw new TerseError(`Invalid \\u escape at ${this.pos}`, this.pos, "INVALID_ESCAPE");
            r += String.fromCharCode(parseInt(hex, 16));
            this.pos += 4;
            break;
          }
          default:
            throw new TerseError(
              `Invalid escape '\\${esc}' at ${this.pos}`, this.pos, "INVALID_ESCAPE");
        }
        this.pos++;
      } else {
        r += ch; this.pos++;
      }
    }
    throw new TerseError(`Unterminated string at ${start}`, start, "UNTERMINATED_STRING");
  }

  // ── bare identifier ────────────────────────────────────────────────────────

  parseSafeId(): string {
    SAFE_ID_RE.lastIndex = this.pos;
    const m = SAFE_ID_RE.exec(this.src);
    if (!m)
      throw new TerseError(
        `Expected identifier at ${this.pos}, got '${this.cur()}'`, this.pos, "EXPECTED_KEY");
    this.pos += m[0].length;
    return m[0];
  }

  parseKey(): string {
    return this.cur() === '"' ? this.parseQuotedString() : this.parseSafeId();
  }

  // ── primitive (for schema-array rows: no nested containers) ───────────────

  parsePrimitive(): null | boolean | number | string {
    const ch = this.cur();
    if (ch === "~") { this.pos++; return null; }
    if (ch === '"') return this.parseQuotedString();
    // number before safe-id (§4.3)
    if (ch === "-" || (ch >= "0" && ch <= "9")) return this.parseNumber();
    if (SAFE_START_RE.test(ch)) {
      const id = this.parseSafeId();
      if (id === "T") return true;
      if (id === "F") return false;
      return id;
    }
    throw new TerseError(`Expected primitive at ${this.pos}`, this.pos, "UNEXPECTED_CHARACTER");
  }

  // ── value ──────────────────────────────────────────────────────────────────

  parseValue(): unknown {
    this.depth++;
    if (this.depth > MAX_DEPTH)
      throw new TerseError("Maximum nesting depth (64) exceeded", this.pos, "MAX_DEPTH_EXCEEDED");

    try {
      this.skipHws();
      const ch = this.cur();

      if (ch === "") throw new TerseError("Unexpected end of input", this.pos, "UNEXPECTED_EOF");
      if (ch === "~") { this.pos++; return null; }
      if (ch === '"') return this.parseQuotedString();
      if (ch === "{") return this.parseObject();
      if (ch === "[") return this.parseArray();
      if (ch === "#") return this.parseSchemaArray();

      // number takes precedence (§4.3)
      if (ch === "-" || (ch >= "0" && ch <= "9")) return this.parseNumber();

      // safe-id (T → true, F → false, otherwise string)
      if (SAFE_START_RE.test(ch)) {
        const id = this.parseSafeId();
        if (id === "T") return true;
        if (id === "F") return false;
        return id;
      }

      throw new TerseError(
        `Unexpected character '${ch}' at position ${this.pos}`, this.pos, "UNEXPECTED_CHARACTER");
    } finally {
      this.depth--;
    }
  }

  // ── object { … } ──────────────────────────────────────────────────────────

  parseObject(): Record<string, unknown> {
    const start = this.pos;
    this.pos++; // skip {

    const obj: Record<string, unknown> = {};

    // Determine inline vs block form by peeking for newline
    this.skipHws();
    const isBlock = this.cur() === "\n" || this.cur() === "\r";

    while (!this.eof()) {
      if (isBlock) this.skipWsLines(); else this.skipHws();
      if (this.cur() === "}") break;
      if (this.eof())
        throw new TerseError(`Unterminated object at ${start}`, start, "UNTERMINATED_OBJECT");

      const key = this.parseKey();
      this.skipHws();
      this.expect(":");
      this.skipHws();
      if (isBlock && (this.cur() === "\n" || this.cur() === "\r")) this.skipWsLines();

      const val = this.parseValue();

      if (Object.prototype.hasOwnProperty.call(obj, key))
        throw new TerseError(`Duplicate key '${key}' at ${this.pos}`, this.pos, "DUPLICATE_KEY");
      obj[key] = val;

      if (!isBlock) {
        this.skipHws(); // consume space separator between inline pairs
      } else {
        this.skipHws();
        if (this.cur() !== "}" && this.cur() !== "\n" && this.cur() !== "\r" && !this.eof())
          throw new TerseError(`Expected newline after value at ${this.pos}`, this.pos, "EXPECTED_NEWLINE");
      }
    }

    if (this.cur() !== "}")
      throw new TerseError(`Unterminated object at ${start}`, start, "UNTERMINATED_OBJECT");
    this.pos++;
    return obj;
  }

  // ── array [ … ] ───────────────────────────────────────────────────────────

  parseArray(): unknown[] {
    const start = this.pos;
    this.pos++; // skip [

    const items: unknown[] = [];

    this.skipHws();
    const isBlock = this.cur() === "\n" || this.cur() === "\r";

    while (!this.eof()) {
      if (isBlock) this.skipWsLines(); else this.skipHws();
      if (this.cur() === "]") break;
      if (this.eof())
        throw new TerseError(`Unterminated array at ${start}`, start, "UNTERMINATED_ARRAY");

      items.push(this.parseValue());

      if (!isBlock) {
        this.skipHws();
      } else {
        this.skipHws();
        if (this.cur() !== "]" && this.cur() !== "\n" && this.cur() !== "\r" && !this.eof())
          throw new TerseError(`Expected newline after value at ${this.pos}`, this.pos, "EXPECTED_NEWLINE");
      }
    }

    if (this.cur() !== "]")
      throw new TerseError(`Unterminated array at ${start}`, start, "UNTERMINATED_ARRAY");
    this.pos++;
    return items;
  }

  // ── schema-array #[fields] \n  rows … ────────────────────────────────────

  parseSchemaArray(): Record<string, unknown>[] {
    const start = this.pos;
    this.expect("#");
    this.expect("[");

    // field names — space-separated within [ … ]
    const fields: string[] = [];
    this.skipHws();
    while (!this.eof() && this.cur() !== "]") {
      fields.push(this.parseKey());
      this.skipHws();
    }
    this.expect("]");

    if (fields.length === 0)
      throw new TerseError("Schema header must have at least one field", start, "EXPECTED_KEY");

    const rows: Record<string, unknown>[] = [];

    // Each row MUST be on its own line with ≥2-space indentation (§ABNF indent=2SP)
    while (!this.eof()) {
      // Row must start at a newline
      if (this.cur() !== "\n" && this.cur() !== "\r") break;

      const lineStart = this.pos; // save before consuming newline+indent

      // Peek ahead: skip newlines, count leading spaces
      let pi = this.pos;
      while (pi < this.src.length && (this.src[pi] === "\n" || this.src[pi] === "\r")) pi++;
      let spaces = 0;
      while (pi + spaces < this.src.length && this.src[pi + spaces] === " ") spaces++;

      // Require at least 2 spaces — otherwise we've left the schema array
      if (spaces < 2) break;

      // Consume newline(s) and indentation
      while (this.cur() === "\n" || this.cur() === "\r") this.pos++;
      this.skipHws();

      // Skip blank or comment lines
      if (this.cur() === "\n" || this.cur() === "\r") continue;
      if (this.cur() === "/" && this.peek() === "/") {
        while (!this.eof() && this.cur() !== "\n") this.pos++;
        continue;
      }

      // Stop if this line is a KV pair (key followed by ':') — not a data row
      if (this.isKvStart()) {
        this.pos = lineStart; // restore to \n before this line
        break;
      }

      // Parse N positional values
      const row: Record<string, unknown> = {};
      for (let i = 0; i < fields.length; i++) {
        if (i > 0) this.expect(" ");
        row[fields[i]] = this.parsePrimitive();
      }

      // Nothing else allowed on this row
      this.skipHws();
      if (this.cur() !== "\n" && this.cur() !== "\r" && !this.eof())
        throw new TerseError(
          `Schema row has more values than declared fields at ${this.pos}`,
          this.pos, "SCHEMA_WRONG_COLUMNS");

      rows.push(row);
    }

    return rows;
  }
}

// ─── Document Parser ─────────────────────────────────────────────────────────

class DocumentParser {
  private p: Parser;

  constructor(src: string) { this.p = new Parser(src); }

  parse(): Record<string, unknown> {
    const doc: Record<string, unknown> = {};
    this.p.skipWsLines();

    while (!this.p.eof()) {
      const key = this.p.parseKey();
      this.p.skipHws();
      this.p.expect(":");
      this.p.skipHws();

      // value may be on same line or on next line (block form)
      let val: unknown;
      if (this.p.cur() === "\n" || this.p.cur() === "\r") {
        while (this.p.cur() === "\n" || this.p.cur() === "\r") this.p.pos++;
        this.p.skipHws(); // eat indentation
        val = this.p.parseValue();
      } else {
        val = this.p.parseValue();
      }

      if (Object.prototype.hasOwnProperty.call(doc, key))
        throw new TerseError(
          `Duplicate key '${key}' at position ${this.p.pos}`, this.p.pos, "DUPLICATE_KEY");
      doc[key] = val;

      this.p.skipWsLines();
    }

    return doc;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a single TERSE value (null, boolean, number, string, object, array, schema-array).
 */
export function parse(src: string): unknown {
  const p = new Parser(src);
  p.skipWsLines();
  const val = p.parseValue();
  p.skipWsLines();
  if (!p.eof())
    throw new TerseError(
      `Unexpected content at position ${p.pos}`, p.pos, "UNEXPECTED_CONTENT");
  return val;
}

/**
 * Parse a TERSE document (top-level key-value pairs) into a plain object.
 */
export function parseDocument(src: string): Record<string, unknown> {
  return new DocumentParser(src).parse();
}
