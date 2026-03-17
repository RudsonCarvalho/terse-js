/**
 * Appendix B.1 – Complete Application Configuration (value-level round-trip)
 */
import { parse, serialize, parseDocument, serializeDocument } from "../index";

const B1_OBJ = {
  name: "my-app",
  version: "2.1.0",
  private: true,
  author: { name: "Alice", email: "alice@co.com" },
  scripts: { dev: "vite", build: "vite build", test: "vitest" },
  dependencies: { react: "^18.2.0", zustand: "^4.4.1" },
  config: {
    port: 3000,
    debug: false,
    logLevel: "warn",
    tags: ["web", "typescript", "spa"],
  },
};

describe("B.1 – Application Config", () => {
  test("serializeDocument produces parseable output", () => {
    const doc = serializeDocument(B1_OBJ);
    const result = parseDocument(doc);
    expect(result).toEqual(B1_OBJ);
  });

  test("round-trip via serialize/parse for nested object", () => {
    expect(parse(serialize(B1_OBJ))).toEqual(B1_OBJ);
  });

  // NOTE: per §3.5, safe-id must start with ALPHA|_|.|/ — NOT a digit.
  // "2.1.0" starts with a digit, so it cannot be a bare string; it must be quoted.
  // The spec's B.1 example is slightly inconsistent on this point — we test
  // the grammatically correct form below.
  test("B.1 document source parses correctly", () => {
    const src = `name: my-app
version: "2.1.0"
private: T
author: {name:Alice email:"alice@co.com"}
scripts: {dev:vite build:"vite build" test:vitest}
dependencies: {react:"^18.2.0" zustand:"^4.4.1"}
config:
  {
  port: 3000
  debug: F
  logLevel: warn
  tags: [web typescript spa]
  }
`;
    const result = parseDocument(src);
    expect(result.name).toBe("my-app");
    expect(result.version).toBe("2.1.0");
    expect(result.private).toBe(true);
    expect((result.author as Record<string, unknown>).name).toBe("Alice");
    expect((result.scripts as Record<string, unknown>).dev).toBe("vite");
    expect((result.config as Record<string, unknown>).port).toBe(3000);
    expect((result.config as Record<string, unknown>).tags).toEqual(["web", "typescript", "spa"]);
  });
});

/**
 * Full round-trips for all appendix example structures.
 */
describe("Round-trip correctness", () => {
  const fixtures: [string, unknown][] = [
    ["null",    null],
    ["true",    true],
    ["false",   false],
    ["zero",    0],
    ["int",     42],
    ["neg",     -7],
    ["float",   3.14],
    ["sci",     1.5e-10],
    ["string",  "hello"],
    ["strT",    "T"],
    ["strF",    "F"],
    ["strTilde","~"],
    ["strSpc",  "hello world"],
    ["empty-obj", {}],
    ["empty-arr", []],
    ["simple-obj", { a: 1, b: "foo" }],
    ["simple-arr", [1, 2, 3]],
    ["mixed-arr", [1, "hello", true, null]],
    ["nested-obj", { a: { b: { c: 1 } } }],
    ["arr-of-obj", [{ a: 1, b: 2 }, { a: 3, b: 4 }]], // schema array
    ["mixed-arr-obj", [{ x: 1, y: [1, 2] }]], // not schema (non-primitive value)
    ["B1", B1_OBJ],
  ];

  for (const [label, val] of fixtures) {
    test(`round-trip: ${label}`, () => {
      const s = serialize(val);
      const back = parse(s);
      expect(back).toEqual(val);
    });
  }
});
