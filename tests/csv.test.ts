import { describe, it, expect } from "vitest"
import { parseCsv, suggestMapping, applyMapping, parseMoneyCell, parseDateCell } from "../src/worker/csv"

describe("CSV parsing", () => {
  it("handles quoted fields, escaped quotes and CRLF", () => {
    const csv = 'name,notes\r\n"Smith, John","said ""call Tuesday"""\r\nJane,ok\r\n'
    const res = parseCsv(csv)
    expect(res.headers).toEqual(["name", "notes"])
    expect(res.rows).toEqual([["Smith, John", 'said "call Tuesday"'], ["Jane", "ok"]])
  })
  it("sniffs a header row vs headerless data", () => {
    expect(parseCsv("name,phone\nJo,555").headers).toEqual(["name", "phone"])
    const headerless = parseCsv("Jo,555\nSam,556")
    expect(headerless.headers).toEqual(["column_1", "column_2"])
    expect(headerless.rows.length).toBe(2)
  })
  it("drops stray empty rows", () => {
    const res = parseCsv("name,phone\n\nJo,555\n\n")
    expect(res.rows).toEqual([["Jo", "555"]])
  })
})

describe("header mapping", () => {
  it("suggests a mapping for common CRM headers", () => {
    const m = suggestMapping(["lead_name", "phone", "service", "value", "status", "last_contact"])
    expect(m["lead_name"]).toBe("name")
    expect(m["phone"]).toBe("phone")
    expect(m["service"]).toBe("service")
    expect(m["value"]).toBe("value")
    expect(m["status"]).toBe("status")
    expect(m["last_contact"]).toBe("last_contact")
  })
  it("never maps two columns to the same field", () => {
    const m = suggestMapping(["name", "customer_name", "customer"])
    const targets = Object.values(m).filter((t) => t !== "ignore")
    expect(new Set(targets).size).toBe(targets.length)
  })
  it("maps unknown headers to ignore", () => {
    const m = suggestMapping(["name", "misc_field_xyz"])
    expect(m["misc_field_xyz"]).toBe("ignore")
  })
  it("applyMapping routes cells to canonical fields and keeps ignored values", () => {
    const parsed = parseCsv('Name,Phone,Value\n"Smith, Jo",555,"$4,800"')
    const mapping = suggestMapping(parsed.headers)
    const records = applyMapping(parsed.headers, parsed.rows, mapping)
    expect(records[0].values.name).toBe("Smith, Jo")
    expect(records[0].values.phone).toBe("555")
    expect(records[0].values.value).toBe("$4,800")
  })
})

describe("cell coercion", () => {
  it("parses messy money cells", () => {
    expect(parseMoneyCell("$4,800")).toBe(4800)
    expect(parseMoneyCell("£1,200.50")).toBe(1200.5)
    expect(parseMoneyCell("€ 940")).toBe(940)
    expect(parseMoneyCell("")).toBeNull()
    expect(parseMoneyCell("N/A")).toBeNull()
  })
  it("normalises US, EU and ISO date cells to storage format", () => {
    expect(parseDateCell("03/15/2026")).toBe("2026-03-15 12:00:00")
    expect(parseDateCell("15.03.2026")).toBe("2026-03-15 12:00:00")
    expect(parseDateCell("2026-03-15")).toBe("2026-03-15 12:00:00")
    expect(parseDateCell("15/03/26")).toBe("2026-03-15 12:00:00")
    expect(parseDateCell("garbage")).toBeNull()
  })
})
