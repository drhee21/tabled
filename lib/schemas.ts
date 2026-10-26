import { z } from "zod";
import {
  CUISINE_VALUES,
  DIETARY_VALUES,
  NOTE_MAX_LENGTH,
  PRICE_LEVEL_MAX,
  PRICE_LEVEL_MIN,
} from "./preference-options";

export const SESSION_STATUSES = [
  "collecting",
  "searching",
  "voting",
  "closed",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const RADIUS_MIN_M = 100;
export const RADIUS_MAX_M = 10_000;

const HOUR_MS = 60 * 60 * 1000;

export const createSessionSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius_m: z.number().int().min(RADIUS_MIN_M).max(RADIUS_MAX_M),
    meal_time: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    (v) => {
      const t = Date.parse(v.meal_time);
      const now = Date.now();
      // The session lives 24 hours, so the meal has to fall inside that window.
      return t >= now - HOUR_MS && t <= now + 24 * HOUR_MS;
    },
    { message: "Meal time must be within the next 24 hours", path: ["meal_time"] },
  );
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

const unique = <T>(items: T[]): T[] => [...new Set(items)];
const priceLevel = z.number().int().min(PRICE_LEVEL_MIN).max(PRICE_LEVEL_MAX);

export const preferencesSchema = z
  .object({
    dietary: z.array(z.enum(DIETARY_VALUES)).transform(unique),
    budget_min: priceLevel.nullable(),
    budget_max: priceLevel.nullable(),
    cuisines_want: z.array(z.enum(CUISINE_VALUES)).transform(unique),
    cuisines_avoid: z.array(z.enum(CUISINE_VALUES)).transform(unique),
    note: z
      .string()
      .trim()
      .max(NOTE_MAX_LENGTH, `Note must be ${NOTE_MAX_LENGTH} characters or fewer`)
      .nullish()
      .transform((v) => v || null),
  })
  .strict()
  .refine(
    (v) => v.budget_min === null || v.budget_max === null || v.budget_min <= v.budget_max,
    { message: "Minimum budget cannot be above maximum", path: ["budget_min"] },
  )
  .refine((v) => !v.cuisines_want.some((c) => v.cuisines_avoid.includes(c)), {
    message: "A cuisine cannot be both wanted and refused",
    path: ["cuisines_avoid"],
  });
export type PreferencesInput = z.output<typeof preferencesSchema>;

export const joinSessionSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, "Enter a name")
      .max(30, "Name must be 30 characters or fewer"),
  })
  .strict();
export type JoinSessionInput = z.infer<typeof joinSessionSchema>;
