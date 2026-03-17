import { parse, serialize, TerseError } from "../index";

describe("Primitives – parse", () => {
  test("null: ~", () => expect(parse("~")).toBeNull());
  test("true: T", () => expect(parse("T")).toBe(true));
  test("false: F", () => expect(parse("F")).toBe(false));

  test("integer: 0", () => expect(parse("0")).toBe(0));
  test("integer: 42", () => expect(parse("42")).toBe(42));
  test("integer: -1", () => expect(parse("-1")).toBe(-1));
  test("float: 3.14", () => expect(parse("3.14")).toBe(3.14));
  test("scientific: 1e3 is number 1000", () => expect(parse("1e3")).toBe(1000));
  test("scientific: 1.5e-10", () => expect(parse("1.5e-10")).toBe(1.5e-10));
  test("scientific: -4.2", () => expect(parse("-4.2")).toBe(-4.2));

  test("safe-id string: hello", () => expect(parse("hello")).toBe("hello"));
  test("safe-id string: api.example.com", () => expect(parse("api.example.com")).toBe("api.example.com"));
  test("safe-id string: /usr/local/bin", () => expect(parse("/usr/local/bin")).toBe("/usr/local/bin"));
  test("safe-id string: v2.1.0", () => expect(parse("v2.1.0")).toBe("v2.1.0"));
  test("safe-id string: alice@co.com", () => expect(parse("alice@co.com")).toBe("alice@co.com"));

  test('quoted string: "hello world"', () => expect(parse('"hello world"')).toBe("hello world"));
  test('literal "T" must be quoted', () => expect(parse('"T"')).toBe("T"));
  test('literal "F" must be quoted', () => expect(parse('"F"')).toBe("F"));
  test('literal "~" must be quoted', () => expect(parse('"~"')).toBe("~"));

  test("quoted string with escape \\n", () => expect(parse('"a\\nb"')).toBe("a\nb"));
  test("quoted string with escape \\t", () => expect(parse('"a\\tb"')).toBe("a\tb"));
  test("quoted string with escape \\\\", () => expect(parse('"a\\\\b"')).toBe("a\\b"));
  test("quoted string with escape \\u0041", () => expect(parse('"\\u0041"')).toBe("A"));
});

describe("Primitives – serialize", () => {
  test("null → ~", () => expect(serialize(null)).toBe("~"));
  test("true → T", () => expect(serialize(true)).toBe("T"));
  test("false → F", () => expect(serialize(false)).toBe("F"));
  test("0 → 0", () => expect(serialize(0)).toBe("0"));
  test("42 → 42", () => expect(serialize(42)).toBe("42"));
  test("-1 → -1", () => expect(serialize(-1)).toBe("-1"));
  test("3.14 → 3.14", () => expect(serialize(3.14)).toBe("3.14"));
  test("1000 (= 1e3) → 1000", () => expect(serialize(1000)).toBe("1000"));

  test('safe string → bare', () => expect(serialize("hello")).toBe("hello"));
  test('string "T" → quoted', () => expect(serialize("T")).toBe('"T"'));
  test('string "F" → quoted', () => expect(serialize("F")).toBe('"F"'));
  test('string "~" → quoted', () => expect(serialize("~")).toBe('"~"'));
  test('string with space → quoted', () => expect(serialize("hello world")).toBe('"hello world"'));
  test('string "1e3" → quoted (force string)', () => expect(serialize("1e3")).toBe('"1e3"'));

  test("Infinity throws", () => {
    expect(() => serialize(Infinity)).toThrow(TerseError);
  });
  test("NaN throws", () => {
    expect(() => serialize(NaN)).toThrow(TerseError);
  });
});

describe("Primitives – round-trip", () => {
  const vals = [null, true, false, 0, 42, -1, 3.14, 1.5e-10, "hello", "T", "F", "~", "hello world", "1e3"];
  for (const v of vals) {
    test(`round-trip: ${JSON.stringify(v)}`, () => {
      expect(parse(serialize(v))).toEqual(v);
    });
  }
});
