# terse-js

[![CI](https://github.com/RudsonCarvalho/terse-js/actions/workflows/ci.yml/badge.svg)](https://github.com/RudsonCarvalho/terse-js/actions/workflows/ci.yml)

TypeScript/JavaScript implementation of the [TERSE](https://rudsoncarvalho.github.io/terse-format/) format.

**TERSE** (Token-Efficient Recursive Serialization Encoding) is a compact, LLM-native alternative to JSON that covers the full JSON data model with **30–55% fewer tokens**.

## Installation

```bash
npm install terse-js
```

## Usage

```typescript
import { serialize, parse, serializeDocument, parseDocument } from "terse-js";

// Serialize a value
serialize(null)               // "~"
serialize(true)               // "T"
serialize(42)                 // "42"
serialize("hello")            // "hello"
serialize("T")                // '"T"' (quoted — literal T)
serialize({ a: 1, b: "hi" }) // "{a:1 b:hi }"

// Uniform arrays → schema arrays (token-efficient)
serialize([
  { id: 1, name: "Alice", active: true },
  { id: 2, name: "Bob",   active: false },
])
// "#[id name active ]\n  1 Alice T \n  2 Bob F "

// Parse a value
parse("~")                    // null
parse("T")                    // true
parse("{name:Alice age:30}")  // { name: "Alice", age: 30 }
parse("[1 2 3]")              // [1, 2, 3]

// Document API (top-level key-value pairs, no outer braces)
const src = `
name: my-app
version: "2.1.0"
private: T
config:
  {
  port: 3000
  debug: F
  }
`;
parseDocument(src);
// { name: "my-app", version: "2.1.0", private: true, config: { port: 3000, debug: false } }
```

## API

| Function | Description |
|---|---|
| `serialize(val)` | Serialize any value to TERSE |
| `parse(src)` | Parse a TERSE value string |
| `serializeDocument(obj)` | Serialize a plain object as a TERSE document |
| `parseDocument(src)` | Parse a TERSE document into a plain object |

## Format overview

| JSON | TERSE |
|---|---|
| `null` | `~` |
| `true` / `false` | `T` / `F` |
| `"hello"` | `hello` (bare) or `"hello"` (quoted) |
| `{"a":1}` | `{a:1 }` |
| `[1,2,3]` | `[1 2 3 ]` |
| Array of uniform objects | `#[field1 field2 ]` schema array |

See the [TERSE spec](https://github.com/RudsonCarvalho/terse-format) for the full grammar.

## License

MIT
