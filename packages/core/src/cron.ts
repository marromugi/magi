function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;

  if (field.includes(",")) {
    return field.split(",").some((f) => matchesCronField(f.trim(), value));
  }

  if (field.includes("/")) {
    const [range = "", stepStr = ""] = field.split("/");
    const step = parseInt(stepStr, 10);
    if (range === "*") return value % step === 0;
    if (range.includes("-")) {
      const [start = 0, end = 0] = range.split("-").map(Number);
      return value >= start && value <= end && (value - start) % step === 0;
    }
    const start = parseInt(range, 10);
    return value >= start && (value - start) % step === 0;
  }

  if (field.includes("-")) {
    const [start = 0, end = 0] = field.split("-").map(Number);
    return value >= start && value <= end;
  }

  return parseInt(field, 10) === value;
}

function matchesCron(cronExpr: string, date: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5)
    throw new Error(`Invalid cron expression: ${cronExpr}`);

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  const dow = date.getDay(); // 0=Sun...6=Sat

  return (
    matchesCronField(minute, date.getMinutes()) &&
    matchesCronField(hour, date.getHours()) &&
    matchesCronField(dayOfMonth, date.getDate()) &&
    matchesCronField(month, date.getMonth() + 1) &&
    // cron allows 7 as Sunday alias
    (matchesCronField(dayOfWeek, dow) ||
      (dow === 0 && matchesCronField(dayOfWeek, 7)))
  );
}

export function nextCronTime(cronExpr: string, after: Date): Date {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5)
    throw new Error(`Invalid cron expression: ${cronExpr}`);

  const candidate = new Date(after);
  candidate.setSeconds(0);
  candidate.setMilliseconds(0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const MAX_ITERATIONS = 366 * 24 * 60;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (matchesCron(cronExpr, candidate)) return new Date(candidate);
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`No matching time found within 1 year for cron: ${cronExpr}`);
}

export function shouldRun(
  cronExpr: string,
  lastReviewedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (lastReviewedAt === null) return true;
  const next = nextCronTime(cronExpr, new Date(lastReviewedAt));
  return now >= next;
}
