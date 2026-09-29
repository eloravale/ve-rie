import { describe, it, expect } from "vitest"
import {
  ValidationError,
  isoDateOrNull,
  nonNegativeNumber,
  oneOf,
  optionalString,
  requiredString,
  LEAD_STATUSES
} from "../src/worker/validation"

describe("validation", () => {
  it("requiredString rejects empty and non-strings", () => {
    expect(() => requiredString("", "name")).toThrow(ValidationError)
    expect(() => requiredString("   ", "name")).toThrow(ValidationError)
    expect(() => requiredString(42, "name")).toThrow(ValidationError)
    expect(requiredString("  Dana  ", "name")).toBe("Dana")
  })

  it("optionalString normalizes and bounds", () => {
    expect(optionalString(undefined, "x")).toBeNull()
    expect(optionalString("", "x")).toBeNull()
    expect(optionalString(" hi ", "x")).toBe("hi")
    expect(() => optionalString("x".repeat(3000), "notes")).toThrow(ValidationError)
  })

  it("oneOf accepts allowed values and applies fallbacks", () => {
    expect(oneOf("new", LEAD_STATUSES, "status")).toBe("new")
    expect(oneOf(undefined, LEAD_STATUSES, "status", "new")).toBe("new")
    expect(() => oneOf("bogus", LEAD_STATUSES, "status")).toThrow(ValidationError)
  })

  it("nonNegativeNumber rejects negatives and non-numbers", () => {
    expect(nonNegativeNumber("4800", "value")).toBe(4800)
    expect(nonNegativeNumber(undefined, "value", 5)).toBe(5)
    expect(() => nonNegativeNumber(-1, "value")).toThrow(ValidationError)
    expect(() => nonNegativeNumber("abc", "value")).toThrow(ValidationError)
  })

  it("isoDateOrNull normalizes ISO input", () => {
    expect(isoDateOrNull("2026-10-01T12:00:00Z", "d")).toBe("2026-10-01 12:00:00")
    expect(isoDateOrNull("2026-10-01", "d")).toMatch(/^2026-10-01 00:00:00$/)
    expect(isoDateOrNull(null, "d")).toBeNull()
    expect(() => isoDateOrNull("not-a-date", "d")).toThrow(ValidationError)
  })
})
