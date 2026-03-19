import { parse, serialize } from "../index";

describe("Arrays – parse", () => {
  test("empty array", () => expect(parse("[]")).toEqual([]));
  test("inline integers", () => expect(parse("[1 2 3]")).toEqual([1, 2, 3]));
  test("inline booleans and null", () => expect(parse("[T F ~]")).toEqual([true, false, null]));
  test("inline strings", () => expect(parse("[hello world]")).toEqual(["hello", "world"]));
  test("inline mixed", () =>
    expect(parse("[1 hello T ~]")).toEqual([1, "hello", true, null]));
  test("inline nested array", () =>
    expect(parse("[[1 2] [3 4]]")).toEqual([[1, 2], [3, 4]]));
  test("inline array with object", () =>
    expect(parse("[{a:1} {b:2}]")).toEqual([{ a: 1 }, { b: 2 }]));

  test("block array", () =>
    expect(parse("[\n  1\n  hello\n  T\n  ~\n]")).toEqual([1, "hello", true, null]));

  test("array of objects (block)", () =>
    expect(parse("[\n  {sku:A1 qty:2}\n  {sku:B3 qty:1}\n]")).toEqual([
      { sku: "A1", qty: 2 },
      { sku: "B3", qty: 1 },
    ]));
});

describe("Arrays – serialize", () => {
  test("empty array → []", () => expect(serialize([])).toBe("[]"));
  test("small inline array", () => expect(serialize([1, 2, 3])).toBe("[1 2 3 ]"));
  test("booleans and null inline", () => expect(serialize([true, false, null])).toBe("[T F ~ ]"));
  test("strings inline", () => expect(serialize(["hello", "world"])).toBe("[hello world ]"));

  test("single object → inline (not schema array – only 1 element)", () => {
    const s = serialize([{ a: 1 }]);
    // Single object: not schema array (need 2+), should be inline or block array
    expect(parse(s)).toEqual([{ a: 1 }]);
  });
});

describe("Arrays – round-trip", () => {
  const cases: unknown[] = [
    [],
    [1, 2, 3],
    [true, false, null],
    ["hello", "world"],
    [1, "hello", true, null, { a: 1 }],
    [[1, 2], [3, 4]],
  ];
  for (const arr of cases) {
    test(`round-trip: ${JSON.stringify(arr)}`, () => {
      expect(parse(serialize(arr))).toEqual(arr);
    });
  }
});
