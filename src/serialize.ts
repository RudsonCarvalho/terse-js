import { TerseError } from "./types";

// §3.5  safe-start = ALPHA / "_" / "." / "/"
// §3.5  safe-char  = ALPHA / DIGIT / "-" / "_" / "." / "/" / "@"
const SAFE_START = /^[A-Za-z_.\/]/;
const SAFE_ID_RE = /^[A-Za-z_.\/][A-Za-z0-9\-_.\/@]*$/;
const RESERVED = new Set(["T", "F", "~", "{}", "[]"]);
// A token that looks like a number must be a number, not a string (§4.3)
const NUMBER_RE = /^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

const LINE_LIMIT = 80;

// ─── helpers ────────────────────────────────────────────────────────────────

export function isSafeId(s: string): boolean {
  if (!SAFE_ID_RE.test(s)) return false;
  if (RESERVED.has(s)) return false;
  if (NUMBER_RE.test(s)) return false; // §4.3 number takes precedence
  return true;
}

function serializeKey(k: string): string {
  return isSafeId(k) ? k : JSON.stringify(k);
}

function serializeString(s: string): string {
  return isSafeId(s) ? s : JSON.stringify(s);
}

// ─── schema-array detection ──────────────────────────────────────────────────

function isPrimitive(v: unknown): v is null | boolean | number | string {
  return (
    v === null ||
    typeof v === "boolean" ||
    typeof v === "number" ||
    typeof v === "string"
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Returns the shared key list if the array qualifies for schema-array form
 * (§4.6.3: 2+ uniform objects whose values are all primitive).
 * Returns null otherwise.
 */
function schemaKeys(arr: unknown[]): string[] | null {
  if (arr.length < 2) return null;
  if (!arr.every(isPlainObject)) return null;
  const objs = arr as Record<string, unknown>[];
  const keys = Object.keys(objs[0]);
  if (keys.length === 0) return null;
  for (const obj of objs) {
    const ok = Object.keys(obj);
    if (ok.length !== keys.length) return null;
    if (!keys.every((k, i) => ok[i] === k)) return null;
    if (!Object.values(obj).every(isPrimitive)) return null;
  }
  return keys;
}

// ─── inline try (returns null if object/array would be too complex) ──────────

function tryInline(val: unknown, depth = 0): string | null {
  if (depth > 64) return null; // let serialize() emit the depth error
  if (val === null) return "~";
  if (typeof val === "boolean") return val ? "T" : "F";
  if (typeof val === "number") {
    if (!isFinite(val)) return null;
    return String(val);
  }
  if (typeof val === "string") return serializeString(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    if (schemaKeys(val) !== null) return null; // schema arrays are always block
    const parts = val.map((v) => tryInline(v, depth + 1));
    if (parts.some((p) => p === null)) return null;
    return `[${parts.join(" ")}]`;
  }
  if (isPlainObject(val)) {
    const entries = Object.entries(val);
    if (entries.length === 0) return "{}";
    const parts = entries.map(([k, v]) => {
      const vInline = tryInline(v, depth + 1);
      if (vInline === null) return null;
      return `${serializeKey(k)}:${vInline}`;
    });
    if (parts.some((p) => p === null)) return null;
    return `{${parts.join(" ")}}`;
  }
  return null;
}

// ─── block serializers ───────────────────────────────────────────────────────

function serializeSchemaArray(
  arr: Record<string, unknown>[],
  keys: string[],
  depth: number,
): string {
  const ind = "  ".repeat(depth + 1);
  const header = `#[${keys.map(serializeKey).join(" ")}]`;
  const rows = arr.map((obj) => {
    const vals = keys.map((k) => {
      const v = obj[k];
      if (!isPrimitive(v))
        throw new TerseError("Schema array cell must be primitive", -1, "INVALID_VALUE");
      return serializePrimitive(v);
    });
    return `${ind}${vals.join(" ")}`;
  });
  return `${header}\n${rows.join("\n")}`;
}

function serializePrimitive(v: null | boolean | number | string): string {
  if (v === null) return "~";
  if (typeof v === "boolean") return v ? "T" : "F";
  if (typeof v === "number") return String(v);
  return serializeString(v);
}

// ─── main serialize ──────────────────────────────────────────────────────────

/**
 * Serialize any value to TERSE syntax (value-level).
 * Objects are wrapped in `{…}`.  For top-level document format use `serializeDocument`.
 */
export function serialize(val: unknown, depth = 0): string {
  if (depth > 64)
    throw new TerseError("Maximum nesting depth exceeded", -1, "MAX_DEPTH_EXCEEDED");

  if (val === null) return "~";
  if (typeof val === "boolean") return val ? "T" : "F";
  if (typeof val === "number") {
    if (!isFinite(val))
      throw new TerseError(`Cannot serialize non-finite number: ${val}`, -1, "INVALID_VALUE");
    return String(val);
  }
  if (typeof val === "string") return serializeString(val);

  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";

    // Schema array (§4.6.3 – MUST when 2+ uniform objects)
    const sk = schemaKeys(val);
    if (sk !== null) {
      return serializeSchemaArray(val as Record<string, unknown>[], sk, depth);
    }

    // Try inline
    const inline = tryInline(val, depth);
    if (inline !== null && inline.length <= LINE_LIMIT) return inline;

    // Block array
    const ind = "  ".repeat(depth + 1);
    const items = (val as unknown[]).map((v) => `${ind}${serialize(v, depth + 1)}`);
    return `[\n${items.join("\n")}\n${"  ".repeat(depth)}]`;
  }

  if (isPlainObject(val)) {
    const entries = Object.entries(val);
    if (entries.length === 0) return "{}";

    // Try inline
    const inline = tryInline(val, depth);
    if (inline !== null && inline.length <= LINE_LIMIT) return inline;

    // Block object
    const ind = "  ".repeat(depth + 1);
    const lines = entries.map(([k, v]) => {
      const vStr = serialize(v, depth + 1);
      return `${ind}${serializeKey(k)}:${vStr}`;
    });
    return `{\n${lines.join("\n")}\n${"  ".repeat(depth)}}`;
  }

  throw new TerseError(`Cannot serialize value of type ${typeof val}`, -1, "INVALID_TYPE");
}

// ─── document serializer ─────────────────────────────────────────────────────

/**
 * Serialize a plain object as a TERSE document (top-level key-value pairs, no outer braces).
 */
export function serializeDocument(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = serializeKey(k);

    // Schema array at document level
    if (Array.isArray(v)) {
      const sk = schemaKeys(v);
      if (sk !== null) {
        const schemaStr = serializeSchemaArray(v as Record<string, unknown>[], sk, 0);
        lines.push(`${key}:\n  ${schemaStr}`);
        continue;
      }
    }

    const inline = tryInline(v);
    if (inline !== null && (key.length + 2 + inline.length) <= LINE_LIMIT) {
      lines.push(`${key}:${inline}`);
    } else {
      // Block form: value on next line with 2-space indent
      const block = serialize(v, 1);
      lines.push(`${key}:\n  ${block}`);
    }
  }
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}
