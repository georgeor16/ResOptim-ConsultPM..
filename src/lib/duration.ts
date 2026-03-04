import type { TaskDurationUnit } from './types';

/** Convert duration to hours (silent; users never see intermediate values). */
const HOURS_PER_DAY = 8;
const HOURS_PER_WEEK = 40;
const HOURS_PER_MONTH = 173;
const HOURS_PER_QUARTER = 520;

export function durationToHours(value: number, unit: TaskDurationUnit): number {
  const v = Number(value) || 0;
  switch (unit) {
    case 'hours':
      return v;
    case 'days':
      return v * HOURS_PER_DAY;
    case 'weeks':
      return v * HOURS_PER_WEEK;
    case 'months':
      return v * HOURS_PER_MONTH;
    case 'quarters':
      return v * HOURS_PER_QUARTER;
    default:
      return v;
  }
}

/** Get task effort in hours: from durationValue+durationUnit if set, else estimatedHours. */
export function getTaskDurationHours(task: {
  durationValue?: number;
  durationUnit?: TaskDurationUnit;
  estimatedHours: number;
}): number {
  if (
    task.durationValue != null &&
    task.durationUnit != null &&
    Number.isFinite(task.durationValue)
  ) {
    return durationToHours(task.durationValue, task.durationUnit);
  }
  return Number(task.estimatedHours) || 0;
}

export { HOURS_PER_DAY, HOURS_PER_WEEK, HOURS_PER_MONTH, HOURS_PER_QUARTER };
