import { config } from "./config";
import { dayInZone, daysBetween, puzzleNumber } from "./time";

export function todayDate(now = new Date()): string {
  return dayInZone(now, config.timezone);
}

export function dayIndex(date: string): number {
  return daysBetween(config.launchDate, date);
}

export function numberFor(date: string): number {
  return puzzleNumber(date, config.launchDate);
}

export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
