/**
 * HVAC job-type classification + region-aware terminology.
 *
 * Regions describe the same work with different words (furnace vs boiler,
 * "no heat" vs "emergency breakdown"). classifyJobType maps free-form service
 * text to a canonical internal key; jobTypeLabel renders it in the customer's
 * regional vocabulary. Deterministic keyword matching — no AI, explainable.
 */

import type { RegionCode } from "./region"

export const JOB_TYPES = [
  "emergency_repair",
  "maintenance",
  "ac_repair",
  "heating_repair",
  "furnace",
  "boiler",
  "heat_pump",
  "installation",
  "replacement",
  "commercial",
  "ductless",
  "other"
] as const

export type JobType = (typeof JOB_TYPES)[number]

type Rule = { type: JobType; patterns: RegExp[] }

/**
 * Rule order matters: first match wins. Emergency/heating-specific rules are
 * checked before generic ones so "emergency boiler repair" classifies as
 * emergency, not generic heating.
 */
const RULES: Rule[] = [
  {
    type: "emergency_repair",
    patterns: [
      /emergency|no\s*heat|no\s*cool(ing)?|burst|flooding|gas\s*leak|carbon\s*monoxide|sparks?|burning\s*smell|out\s*(now|today)|911|urgent\s*breakdown|breakdown/i,
      /not\s*(cooling|heating|working)\b.*\b(today|now|asap)\b/i
    ]
  },
  { type: "heat_pump", patterns: [/heat\s*pump/i] },
  { type: "boiler", patterns: [/boiler|radiator/i] },
  { type: "furnace", patterns: [/furnace|forced\s*air/i] },
  { type: "commercial", patterns: [/commercial|rooftop|\brtu\b|vrv|vrf|shop|restaurant|office\s*(building|park)|laundromat/i] },
  { type: "ductless", patterns: [/ductless|mini[-\s]?split|\bhead\b.*\bbtu\b/i] },
  { type: "maintenance", patterns: [/maintenance|tune[-\s]?up|service\s*(plan|agreement|visit)|inspection|clean\s*&?\s*check|annual/i] },
  { type: "installation", patterns: [/install|new\s*(system|unit|furnace|boiler|ac|air\s*con)|fitting|mount/i] },
  { type: "replacement", patterns: [/replace(ment)?|swap|convert(ion)?\b/i] },
  { type: "ac_repair", patterns: [/\bac\b|air\s*con(ditioning)?|cooling|compressor|refrigerant|freon|condenser/i] },
  { type: "heating_repair", patterns: [/heating|ignition|pilot|thermostat|ignitor|igniter|heat\s*exchanger/i] }
]

export function classifyJobType(text: string | null | undefined): JobType {
  if (!text) return "other"
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (p.test(text)) return rule.type
    }
  }
  return "other"
}

/** Region-aware display names for the canonical job types. */
const LABELS: Record<JobType, Record<RegionCode, string>> = {
  emergency_repair: { us: "Emergency repair", uk: "Emergency breakdown", eu: "Emergency repair" },
  maintenance: { us: "Maintenance / tune-up", uk: "Service / maintenance", eu: "Maintenance / service" },
  ac_repair: { us: "AC repair", uk: "Air conditioning repair", eu: "Air conditioning repair" },
  heating_repair: { us: "Heating repair", uk: "Heating repair", eu: "Heating repair" },
  furnace: { us: "Furnace", uk: "Warm-air furnace", eu: "Furnace (warm air)" },
  boiler: { us: "Boiler", uk: "Boiler", eu: "Boiler" },
  heat_pump: { us: "Heat pump", uk: "Heat pump", eu: "Heat pump" },
  installation: { us: "Installation", uk: "Installation", eu: "Installation" },
  replacement: { us: "Replacement", uk: "Replacement", eu: "Replacement" },
  commercial: { us: "Commercial HVAC", uk: "Commercial HVAC", eu: "Commercial HVAC" },
  ductless: { us: "Ductless / mini-split", uk: "Air conditioning (split)", eu: "Split / multi-split" },
  other: { us: "Other", uk: "Other", eu: "Other" }
}

export function jobTypeLabel(type: string | null | undefined, region: RegionCode = "us"): string {
  if (!type) return "Other"
  const t = (JOB_TYPES as readonly string[]).includes(type) ? (type as JobType) : classifyJobType(type)
  return LABELS[t][region] ?? LABELS[t].us
}
