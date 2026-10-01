import { describe, it, expect } from "vitest"
import { classifyJobType, jobTypeLabel, JOB_TYPES } from "../src/worker/jobTypes"

describe("HVAC job-type classification", () => {
  it("classifies emergencies before anything else", () => {
    expect(classifyJobType("Emergency — no heat at all")).toBe("emergency_repair")
    expect(classifyJobType("AC not cooling today, need someone now")).toBe("emergency_repair")
  })
  it("recognises equipment-specific work", () => {
    expect(classifyJobType("Boiler losing pressure")).toBe("boiler")
    expect(classifyJobType("Furnace blowing cold air")).toBe("furnace")
    expect(classifyJobType("Heat pump installation quote")).toBe("heat_pump")
    expect(classifyJobType("Ductless mini-split for garage")).toBe("ductless")
  })
  it("keeps commercial work distinct from maintenance", () => {
    expect(classifyJobType("Quarterly RTU service agreement")).toBe("commercial")
    expect(classifyJobType("Annual tune-up and inspection")).toBe("maintenance")
  })
  it("falls back to repair/replacement/other sensibly", () => {
    expect(classifyJobType("Thermostat replacement")).toBe("replacement")
    expect(classifyJobType("Refrigerant leak repair")).toBe("ac_repair")
    expect(classifyJobType("Something vague")).toBe("other")
    expect(classifyJobType(null)).toBe("other")
  })
})

describe("region-aware labels", () => {
  it("uses regional vocabulary for the same work", () => {
    expect(jobTypeLabel("furnace", "us")).toBe("Furnace")
    expect(jobTypeLabel("furnace", "uk")).toBe("Warm-air furnace")
    expect(jobTypeLabel("ac_repair", "uk")).toBe("Air conditioning repair")
    expect(jobTypeLabel("emergency_repair", "uk")).toBe("Emergency breakdown")
  })
  it("defaults gracefully and covers every canonical type", () => {
    expect(jobTypeLabel(null)).toBe("Other")
    expect(jobTypeLabel("nonexistent_key", "eu")).toBe("Other")
    for (const t of JOB_TYPES) {
      expect(jobTypeLabel(t, "us")).toBeTruthy()
      expect(jobTypeLabel(t, "uk")).toBeTruthy()
      expect(jobTypeLabel(t, "eu")).toBeTruthy()
    }
  })
  it("classifies free-form labels passed to the label function", () => {
    expect(jobTypeLabel("boiler service", "uk")).toBeTruthy()
  })
})
