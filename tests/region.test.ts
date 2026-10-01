import { describe, it, expect } from "vitest"
import { money, moneyCompact, formatDate, formatDateTime, responseBucket, REGION_PRESETS } from "../src/worker/region"

describe("region formatting — currency", () => {
  it("formats USD with grouping", () => {
    expect(money(4800, "USD")).toBe("$4,800")
    expect(money(1234567, "USD")).toBe("$1,234,567")
  })
  it("formats GBP and EUR with correct symbols", () => {
    expect(money(1200, "GBP")).toBe("£1,200")
    expect(money(940, "EUR")).toBe("€940")
  })
  it("rounds fractional amounts and tolerates null/undefined", () => {
    expect(money(4800.6, "USD")).toBe("$4,801")
    expect(money(null, "USD")).toBe("$0")
    expect(money(undefined, "GBP")).toBe("£0")
  })
  it("compacts large values for tight UI spots", () => {
    expect(moneyCompact(7400, "USD")).toBe("$7.4k")
    expect(moneyCompact(6000, "GBP")).toBe("£6k")
    expect(moneyCompact(480, "EUR")).toBe("€480")
  })
  it("region presets pair currency and date format", () => {
    expect(REGION_PRESETS.us).toEqual({ currency: "USD", dateFormat: "MDY" })
    expect(REGION_PRESETS.uk.currency).toBe("GBP")
    expect(REGION_PRESETS.eu.dateFormat).toBe("DMY")
  })
})

describe("region formatting — dates", () => {
  const ts = "2026-03-05 13:45:00"
  it("renders MDY for US", () => {
    expect(formatDate(ts, "MDY")).toBe("03/05/2026")
  })
  it("renders DMY for UK/EU", () => {
    expect(formatDate(ts, "DMY")).toBe("05/03/2026")
  })
  it("renders datetimes with 12-hour clock", () => {
    expect(formatDateTime(ts, "MDY")).toBe("03/05/2026 1:45 PM")
    expect(formatDateTime("2026-03-05T09:05:00Z", "DMY")).toBe("05/03/2026 9:05 AM")
  })
  it("handles null and garbage safely", () => {
    expect(formatDate(null, "MDY")).toBe("—")
    expect(formatDate("not-a-date", "DMY")).toBe("—")
  })
})

describe("response bucketing", () => {
  it("buckets response minutes into the four windows", () => {
    expect(responseBucket(3)).toBe("lt5")
    expect(responseBucket(7)).toBe("5to30")
    expect(responseBucket(60)).toBe("30to120")
    expect(responseBucket(200)).toBe("over120")
  })
  it("returns null when there was no response", () => {
    expect(responseBucket(null)).toBeNull()
    expect(responseBucket(undefined)).toBeNull()
  })
})
