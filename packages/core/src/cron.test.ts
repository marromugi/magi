import { describe, it, expect } from "bun:test";
import { shouldRun, nextCronTime } from "./cron.js";

describe("shouldRun", () => {
  it("returns true when lastReviewedAt is null", () => {
    expect(shouldRun("0 9 * * *", null)).toBe(true);
  });

  it("returns true when current time is past the next cron time after last run", () => {
    const now = new Date("2026-04-19T09:01:00");
    expect(shouldRun("0 9 * * *", "2026-04-18T08:00:00", now)).toBe(true);
  });

  it("returns false when current time is before the next cron time after last run", () => {
    const now = new Date("2026-04-19T10:00:00");
    expect(shouldRun("0 9 * * *", "2026-04-19T09:00:00", now)).toBe(false);
  });

  it("returns true exactly at the next scheduled time", () => {
    const now = new Date("2026-04-19T09:00:00");
    expect(shouldRun("0 9 * * *", "2026-04-18T09:00:00", now)).toBe(true);
  });

  it("returns true for every-5-minutes cron when 5+ minutes have passed", () => {
    const now = new Date("2026-04-19T10:06:00");
    expect(shouldRun("*/5 * * * *", "2026-04-19T10:00:00", now)).toBe(true);
  });

  it("returns false for every-5-minutes cron when fewer than 5 minutes have passed", () => {
    const now = new Date("2026-04-19T10:04:00");
    expect(shouldRun("*/5 * * * *", "2026-04-19T10:00:00", now)).toBe(false);
  });

  it("returns true for weekly schedule when one week has passed", () => {
    // 2026-04-13 and 2026-04-20 are both Mondays
    const now = new Date("2026-04-20T12:01:00");
    expect(shouldRun("0 12 * * 1", "2026-04-13T12:00:00", now)).toBe(true);
  });

  it("returns false for weekly schedule when less than one week has passed", () => {
    // Last ran Monday Apr 20, now is Thursday Apr 23
    const now = new Date("2026-04-23T12:00:00");
    expect(shouldRun("0 12 * * 1", "2026-04-20T12:00:00", now)).toBe(false);
  });
});

describe("nextCronTime", () => {
  it("returns the next matching time within the same day", () => {
    const after = new Date("2026-04-19T08:59:00");
    const next = nextCronTime("0 9 * * *", after);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(19);
  });

  it("advances to the next day when the time has already passed today", () => {
    const after = new Date("2026-04-19T09:30:00");
    const next = nextCronTime("0 9 * * *", after);
    expect(next.getDate()).toBe(20);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it("handles step expressions in minute field", () => {
    const after = new Date("2026-04-19T10:02:00");
    const next = nextCronTime("*/5 * * * *", after);
    expect(next.getMinutes()).toBe(5);
    expect(next.getHours()).toBe(10);
  });

  it("throws on invalid cron expression", () => {
    expect(() => nextCronTime("invalid", new Date())).toThrow();
  });
});
