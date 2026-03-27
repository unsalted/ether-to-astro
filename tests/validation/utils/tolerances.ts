export const TOLERANCES = {
  positionLongitudeDeg: 0.0001,
  positionLatitudeDeg: 0.0001,
  positionSpeedDegPerDay: 0.0001,
  houseDeg: 0.01,
  rootPreferredMinutes: 2,
  rootHardMinutes: 10,
  riseSetMinutes: 1,
  eclipseMinutes: 1,
  dedupeMinutes: 1,
};

export const MINUTES_TO_DAYS = 1 / 1440;

export function minutesToDays(minutes: number): number {
  return minutes * MINUTES_TO_DAYS;
}

export function minutesBetweenIso(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 60000;
}
