/**
 * Error codes produced by the TERSE parser.
 */
export type TerseErrorCode =
  | "ILLEGAL_CHARACTER"
  | "UNEXPECTED_EOF"
  | "UNEXPECTED_CHARACTER"
  | "UNTERMINATED_STRING"
  | "INVALID_ESCAPE"
  | "UNTERMINATED_OBJECT"
  | "UNTERMINATED_ARRAY"
  | "DUPLICATE_KEY"
  | "EXPECTED_COLON"
  | "EXPECTED_KEY"
  | "EXPECTED_NEWLINE"
  | "MAX_DEPTH_EXCEEDED"
  | "INVALID_VALUE"
  | "INVALID_TYPE"
  | "SCHEMA_WRONG_COLUMNS"
  | "UNEXPECTED_CONTENT";

/**
 * Typed error thrown by TERSE parse and serialize operations.
 * `position` is the byte offset in the source string (–1 for serializer errors).
 */
export class TerseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
    public readonly code: TerseErrorCode = "UNEXPECTED_CHARACTER",
  ) {
    super(message);
    this.name = "TerseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
