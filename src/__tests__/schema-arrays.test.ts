import { parse, serialize, parseDocument, serializeDocument, TerseError } from "../index";

// B.2 REST API Response — Uniform Array
const B2_SRC = `total: 5
page: 1
data:
  #[id name email role active score]
  1 "Ana Lima" ana@co.com admin T 98.5
  2 "Bruno Melo" bruno@co.com editor T 87.2
  3 "Carla Neves" carla@co.com viewer F 72.0
`;

const B2_OBJ = {
  total: 5,
  page: 1,
  data: [
    { id: 1, name: "Ana Lima", email: "ana@co.com", role: "admin", active: true, score: 98.5 },
    { id: 2, name: "Bruno Melo", email: "bruno@co.com", role: "editor", active: true, score: 87.2 },
    { id: 3, name: "Carla Neves", email: "carla@co.com", role: "viewer", active: false, score: 72.0 },
  ],
};

describe("Schema arrays – parse", () => {
  test("simple two-column schema", () =>
    expect(parse("#[name age]\n  Alice 30\n  Bob 25")).toEqual([
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]));

  test("null value in schema row (~)", () =>
    expect(parse("#[id role]\n  1 ~\n  2 admin")).toEqual([
      { id: 1, role: null },
      { id: 2, role: "admin" },
    ]));

  test("booleans in schema rows", () =>
    expect(parse("#[name active]\n  Alice T\n  Bob F")).toEqual([
      { name: "Alice", active: true },
      { name: "Bob", active: false },
    ]));

  test("quoted values in schema rows", () =>
    expect(parse('#[id name]\n  1 "Ana Lima"\n  2 "Bruno Melo"')).toEqual([
      { id: 1, name: "Ana Lima" },
      { id: 2, name: "Bruno Melo" },
    ]));

  test("B.2 full document parse", () => {
    const result = parseDocument(B2_SRC);
    expect(result).toEqual(B2_OBJ);
  });

  test("empty schema array (zero rows)", () =>
    expect(parse("#[name age]")).toEqual([]));

  test("single-column schema", () =>
    expect(parse("#[x]\n  1\n  2\n  3")).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]));
});

describe("Schema arrays – serialize (MUST use schema form for 2+ uniform objects)", () => {
  test("2 uniform objects → schema array form", () => {
    const arr = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const s = serialize(arr);
    expect(s).toContain("#[a b ]");
    expect(parse(s)).toEqual(arr);
  });

  test("3 rows with nulls", () => {
    const arr = [
      { id: 1, role: null },
      { id: 2, role: "admin" },
      { id: 3, role: null },
    ];
    const s = serialize(arr);
    expect(s).toContain("#[id role ]");
    expect(s).toContain("~");
    expect(parse(s)).toEqual(arr);
  });

  test("objects with non-primitive value → NOT schema array", () => {
    const arr = [
      { a: 1, b: { nested: true } },
      { a: 2, b: { nested: false } },
    ];
    const s = serialize(arr);
    expect(s).not.toContain("#[");
    expect(parse(s)).toEqual(arr);
  });

  test("single object → NOT schema array (need 2+)", () => {
    const arr = [{ a: 1 }];
    const s = serialize(arr);
    expect(s).not.toContain("#[");
  });

  test("different key sets → NOT schema array", () => {
    const arr = [{ a: 1 }, { b: 2 }];
    const s = serialize(arr);
    expect(s).not.toContain("#[");
    expect(parse(s)).toEqual(arr);
  });
});

describe("Schema arrays – round-trip", () => {
  test("B.2 data round-trip", () => {
    const s = serializeDocument(B2_OBJ);
    expect(parseDocument(s)).toEqual(B2_OBJ);
  });

  test("schema array value round-trip", () => {
    const arr = [
      { name: "Alice", score: 98.5, active: true },
      { name: "Bob",   score: 87.2, active: true },
      { name: "Carol", score: null, active: false },
    ];
    expect(parse(serialize(arr))).toEqual(arr);
  });
});
