import { parse, serialize, parseDocument, serializeDocument, TerseError } from "../index";

// ── Appendix B.3 – Deeply Nested Order ───────────────────────────────────────
const B3_SRC = `orderId: ORD-88421
status: confirmed
customer: {id:1042 name:"Rafael Torres" email:"r@email.com"}
shipping:
  {
  address: "Rua das Flores, 123"
  city: "São Paulo"
  method: express
  estimatedDays: 2
  }
items:
  #[sku name qty unitPrice]
  PRD-001 "Notebook Pro 15" 1 4599.90
  PRD-002 "Mouse Wireless" 2 149.90
payment:
  {
  method: credit_card
  installments: 12
  total: 4924.70
  }
`;

describe("B.3 – Deeply Nested Order", () => {
  test("parse B.3 document", () => {
    const result = parseDocument(B3_SRC);
    expect(result.orderId).toBe("ORD-88421");
    expect(result.status).toBe("confirmed");
    expect((result.customer as Record<string, unknown>).name).toBe("Rafael Torres");
    expect((result.shipping as Record<string, unknown>).city).toBe("São Paulo");
    const items = result.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0].sku).toBe("PRD-001");
    expect(items[1].qty).toBe(2);
    const payment = result.payment as Record<string, unknown>;
    expect(payment.method).toBe("credit_card");
  });
});

// ── Appendix B.4 – Mixed Types and Edge Cases ─────────────────────────────────
const B4_SRC = `flag: T
label: "T"
value: ~
literal: "~"
emptyObj: {}
emptyArr: []
`;

describe("B.4 – Mixed Types / Reserved as Strings", () => {
  test("parse B.4 document", () => {
    const result = parseDocument(B4_SRC);
    expect(result.flag).toBe(true);
    expect(result.label).toBe("T");
    expect(result.value).toBeNull();
    expect(result.literal).toBe("~");
    expect(result.emptyObj).toEqual({});
    expect(result.emptyArr).toEqual([]);
  });
});

// ── Tabs rejected ─────────────────────────────────────────────────────────────
describe("Tabs rejected", () => {
  test("tab at start throws ILLEGAL_CHARACTER", () => {
    const err = (() => { try { parse("\ta:1"); } catch(e) { return e; } })() as TerseError;
    expect(err).toBeInstanceOf(TerseError);
    expect(err.code).toBe("ILLEGAL_CHARACTER");
  });

  test("tab inside value throws ILLEGAL_CHARACTER", () => {
    expect(() => parse("{a:\t1}")).toThrow(TerseError);
  });

  test("tab inside object throws ILLEGAL_CHARACTER", () => {
    expect(() => parse("{\ta:1}")).toThrow(TerseError);
  });
});

// ── Numbers precede safe-id ───────────────────────────────────────────────────
describe("Numbers precede safe-id (§4.3)", () => {
  test("1e3 is number 1000, not string", () => {
    expect(parse("1e3")).toBe(1000);
    expect(typeof parse("1e3")).toBe("number");
  });

  test("-5 is number, not string", () => {
    expect(parse("-5")).toBe(-5);
  });

  test("3.14 is number", () => {
    expect(parse("3.14")).toBe(3.14);
  });

  test('"1e3" (quoted) is string', () => {
    expect(parse('"1e3"')).toBe("1e3");
  });

  test("serialize 1000 → 1000, parse back → 1000 (not 1e3)", () => {
    expect(parse(serialize(1000))).toBe(1000);
  });
});

// ── 64-level nesting ──────────────────────────────────────────────────────────
describe("Maximum nesting depth (64)", () => {
  function buildNestedObject(depth: number): Record<string, unknown> {
    let obj: Record<string, unknown> = { x: 1 };
    for (let i = 0; i < depth - 1; i++) obj = { nested: obj };
    return obj;
  }

  test("63 levels deep – parse & serialize ok", () => {
    const obj = buildNestedObject(63);
    expect(() => serialize(obj)).not.toThrow();
    expect(parse(serialize(obj))).toEqual(obj);
  });

  test("serialize at depth > 64 throws", () => {
    // Build an object 65 levels deep
    let obj: Record<string, unknown> = { x: 1 };
    for (let i = 0; i < 65; i++) obj = { n: obj };
    expect(() => serialize(obj)).toThrow(TerseError);
  });
});

// ── Duplicate keys ────────────────────────────────────────────────────────────
describe("Duplicate keys", () => {
  test("inline object duplicate key throws DUPLICATE_KEY", () => {
    const err = (() => { try { parse("{a:1 a:2}"); } catch(e) { return e; } })() as TerseError;
    expect(err.code).toBe("DUPLICATE_KEY");
  });

  test("block object duplicate key throws DUPLICATE_KEY", () => {
    const err = (() => { try { parse("{\n  a: 1\n  a: 2\n}"); } catch(e) { return e; } })() as TerseError;
    expect(err.code).toBe("DUPLICATE_KEY");
  });

  test("document duplicate key throws DUPLICATE_KEY", () => {
    expect(() => parseDocument("a: 1\na: 2\n")).toThrow(TerseError);
  });
});

// ── Comments ──────────────────────────────────────────────────────────────────
describe("Comments (§3.3)", () => {
  test("comment-only document returns empty object", () => {
    expect(parseDocument("// this is a comment\n")).toEqual({});
  });

  test("comment before entry", () => {
    expect(parseDocument("// comment\nname: Alice\n")).toEqual({ name: "Alice" });
  });
});

// ── CRLF normalisation ────────────────────────────────────────────────────────
describe("CRLF normalisation", () => {
  test("\\r\\n treated same as \\n in block object", () => {
    const src = "{\r\n  a: 1\r\n  b: 2\r\n}";
    expect(parse(src)).toEqual({ a: 1, b: 2 });
  });
});

// ── safe-id edge cases ────────────────────────────────────────────────────────
describe("Safe-id grammar", () => {
  test("safe-id starting with . is valid", () => expect(parse(".hidden")).toBe(".hidden"));
  test("safe-id starting with / is valid", () => expect(parse("/usr/local")).toBe("/usr/local"));
  test("safe-id with @ is valid", () => expect(parse("alice@co.com")).toBe("alice@co.com"));
  test("safe-id with - in middle is valid", () => expect(parse("my-value")).toBe("my-value"));

  test("string starting with digit must be number or quoted", () => {
    // "404" as a value without quotes → number
    expect(parse("404")).toBe(404);
    // "404" quoted → string
    expect(parse('"404"')).toBe("404");
  });
});

// ── Serializer: quoted keys ───────────────────────────────────────────────────
describe("Serializer: keys requiring quotes", () => {
  test("key with space → quoted in output", () => {
    const obj = { "hello world": 1 };
    const s = serialize(obj);
    expect(s).toContain('"hello world"');
    expect(parse(s)).toEqual(obj);
  });

  test('key "T" → quoted in output', () => {
    const obj = { T: "value" };
    const s = serialize(obj);
    expect(s).toContain('"T"');
    expect(parse(s)).toEqual(obj);
  });
});
