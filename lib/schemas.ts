import { z } from "zod";

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
