import { parse, serialize, parseDocument, serializeDocument, TerseError } from "../index";

describe("Objects – parse (value-level)", () => {
  test("empty object", () => expect(parse("{}")).toEqual({}));
  test("inline single entry", () => expect(parse("{a:1}")).toEqual({ a: 1 }));
  test("inline two entries", () => expect(parse("{name:Alice age:30}")).toEqual({ name: "Alice", age: 30 }));
  test("nested inline object", () => expect(parse("{a:{b:1}}")).toEqual({ a: { b: 1 } }));
  test("deeply nested inline", () =>
    expect(parse("{a:{b:{c:3}}}")).toEqual({ a: { b: { c: 3 } } }));

  test("block object", () =>
    expect(parse("{\n  name: Alice\n  age: 30\n}")).toEqual({ name: "Alice", age: 30 }));

  test("mixed primitives in object", () =>
    expect(parse("{a:~ b:T c:F d:42 e:hello}")).toEqual({
      a: null, b: true, c: false, d: 42, e: "hello",
    }));

  test("quoted key", () => expect(parse('{"my key":1}')).toEqual({ "my key": 1 }));
  test("quoted value", () => expect(parse('{"name":"hello world"}')).toEqual({ name: "hello world" }));
});

describe("Objects – error cases", () => {
  test("duplicate key throws DUPLICATE_KEY", () => {
    const err = (() => { try { parse("{a:1 a:2}"); } catch(e) { return e; } })() as TerseError;
    expect(err).toBeInstanceOf(TerseError);
    expect(err.code).toBe("DUPLICATE_KEY");
  });

  test("missing colon throws", () => {
    expect(() => parse("{a 1}")).toThrow(TerseError);
  });
});

describe("Objects – serializeDocument / parseDocument", () => {
  test("B.1 app config round-trip", () => {
    const obj = {
      name: "my-app",
      version: "2.1.0",
      private: true,
      author: { name: "Alice", email: "alice@co.com" },
    };
    const doc = serializeDocument(obj);
    const result = parseDocument(doc);
    expect(result).toEqual(obj);
  });

  test("parseDocument top-level primitives", () => {
    const src = "total: 5\npage: 1\nactive: T\n";
    expect(parseDocument(src)).toEqual({ total: 5, page: 1, active: true });
  });

  test("parseDocument nested inline object", () => {
    const src = 'author: {name:Alice email:"alice@co.com"}\n';
    expect(parseDocument(src)).toEqual({ author: { name: "Alice", email: "alice@co.com" } });
  });

  test("serializeDocument produces key: value lines", () => {
    const doc = serializeDocument({ a: 1, b: "hello" });
    expect(doc).toContain("a:1");
    expect(doc).toContain("b:hello");
  });

  test("document duplicate key throws", () => {
    expect(() => parseDocument("a: 1\na: 2\n")).toThrow(TerseError);
  });
});

describe("Objects – round-trip (value-level)", () => {
  const cases = [
    {},
    { a: 1 },
    { name: "Alice", age: 30 },
    { a: null, b: true, c: false, d: 3.14 },
    { nested: { x: 1, y: 2 } },
    { "quoted key": "value" },
  ];
  for (const obj of cases) {
    test(`round-trip: ${JSON.stringify(obj)}`, () => {
      expect(parse(serialize(obj))).toEqual(obj);
    });
  }
});
