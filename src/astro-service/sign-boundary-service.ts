import type { EphemerisCalculator } from '../ephemeris.js';
import { addLocalDays, localToUTC, utcToLocal } from '../time-utils.js';
import {
  PLANET_IDS_BY_NAME,
  SIGN_BOUNDARY_BODIES,
  type SignBoundaryEvent,
  type SignBoundaryEventResponse,
  ZODIAC_SIGNS,
} from '../types.js';
import { parseDateOnlyInput } from './date-input.js';
import type { GetSignBoundaryEventsInput, ServiceResult } from './service-types.js';
import { normalizeLongitude } from './shared.js';

interface SignBoundaryServiceDependencies {
  ephem: EphemerisCalculator;
  now: () => Date;
}

const ROOT_CLASSIFICATION_SAMPLE_DAYS = 1 / 24;

/**
 * Internal stateless sign-boundary event scanner used by `AstroService`.
 *
 * @remarks
 * This service owns local-day window resolution plus exact root lookup for
 * planets crossing zodiac sign boundaries. It returns reusable structured
 * events rather than question-shaped ingress/egress prose.
 */
export class SignBoundaryService {
  private readonly ephem: EphemerisCalculator;
  private readonly now: () => Date;

  constructor(deps: SignBoundaryServiceDependencies) {
    this.ephem = deps.ephem;
    this.now = deps.now;
  }

  /**
   * Return sign-boundary crossing events across a local calendar window.
   */
  getSignBoundaryEvents(
    input: GetSignBoundaryEventsInput & { timezone: string }
  ): ServiceResult<Record<string, unknown>> {
    const daysAhead = input.days_ahead ?? 0;
    if (!Number.isFinite(daysAhead) || daysAhead < 0) {
      throw new Error('days_ahead must be a finite number >= 0');
    }

    const requestedBodies = input.bodies ?? SIGN_BOUNDARY_BODIES;
    for (const body of requestedBodies) {
      if (!SIGN_BOUNDARY_BODIES.includes(body)) {
        throw new Error(
          `Invalid body: ${body} (must be one of ${SIGN_BOUNDARY_BODIES.join(', ')})`
        );
      }
    }

    const windowStart = this.resolveWindowStart(input.date, input.timezone);
    const windowEnd = addLocalDays(
      utcToLocal(windowStart, input.timezone),
      input.timezone,
      daysAhead + 1
    );
    const startJD = this.ephem.dateToJulianDay(windowStart);
    const endJD = this.ephem.dateToJulianDay(windowEnd);

    const events: SignBoundaryEvent[] = [];
    const seenKeys = new Set<string>();

    for (const body of requestedBodies) {
      const planetId = PLANET_IDS_BY_NAME[body];

      for (let signIndex = 0; signIndex < ZODIAC_SIGNS.length; signIndex++) {
        const boundaryLongitude = signIndex * 30;
        const roots = this.ephem.findExactTransitTimes(planetId, boundaryLongitude, startJD, endJD);

        for (const root of roots) {
          if (root >= endJD) {
            continue;
          }

          const crossing = this.classifyCrossing(planetId, root, boundaryLongitude);
          if (!crossing) {
            continue;
          }

          const eventDate = this.ephem.julianDayToDate(root);
          const position = this.ephem.getPlanetPosition(planetId, root);
          const normalizedLongitude = normalizeLongitude(position.longitude);
          const event: SignBoundaryEvent = {
            body,
            from_sign: crossing.fromSign,
            to_sign: crossing.toSign,
            exact_time: eventDate.toISOString(),
            longitude: Number.parseFloat(normalizedLongitude.toFixed(6)),
            direction: crossing.direction,
          };
          const dedupeKey = `${event.body}:${event.exact_time}:${event.to_sign}:${event.from_sign}`;
          if (!seenKeys.has(dedupeKey)) {
            seenKeys.add(dedupeKey);
            events.push(event);
          }
        }
      }
    }

    events.sort((left, right) => {
      const timeOrder = left.exact_time.localeCompare(right.exact_time);
      if (timeOrder !== 0) {
        return timeOrder;
      }
      return left.body.localeCompare(right.body);
    });

    const startLocal = utcToLocal(windowStart, input.timezone);
    const response: SignBoundaryEventResponse = {
      date: this.formatDateLabel(startLocal),
      timezone: input.timezone,
      calculation_timezone: input.timezone,
      reporting_timezone: input.timezone,
      days_ahead: daysAhead,
      events,
    };

    const rangeLabel = daysAhead > 0 ? ` (next ${daysAhead + 1} days)` : '';
    const humanText =
      events.length === 0
        ? `No sign-boundary events found${rangeLabel}.`
        : `Sign-boundary events${rangeLabel}:\n\n${events
            .map(
              (event) =>
                `${event.body}: ${event.from_sign} -> ${event.to_sign} at ${event.exact_time} (${event.direction})`
            )
            .join('\n')}`;

    return {
      data: response as unknown as Record<string, unknown>,
      text: humanText,
    };
  }

  /**
   * Resolve the local-midnight window start for the requested date.
   */
  private resolveWindowStart(date: string | undefined, timezone: string): Date {
    if (date) {
      const parsed = parseDateOnlyInput(date);
      return localToUTC({ ...parsed, hour: 0, minute: 0, second: 0 }, timezone);
    }

    const localNow = utcToLocal(this.now(), timezone);
    return localToUTC(
      {
        year: localNow.year,
        month: localNow.month,
        day: localNow.day,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timezone
    );
  }

  /**
   * Format a local date for stable response metadata.
   */
  private formatDateLabel(localDate: { year: number; month: number; day: number }): string {
    return `${localDate.year}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;
  }

  private classifyCrossing(
    planetId: number,
    root: number,
    boundaryLongitude: number
  ): { fromSign: string; toSign: string; direction: 'direct' | 'retrograde' } | null {
    const before = this.signedBoundaryOffset(
      planetId,
      root - ROOT_CLASSIFICATION_SAMPLE_DAYS,
      boundaryLongitude
    );
    const after = this.signedBoundaryOffset(
      planetId,
      root + ROOT_CLASSIFICATION_SAMPLE_DAYS,
      boundaryLongitude
    );

    if (before === 0 || after === 0 || before === after) {
      return null;
    }

    const toSignIndex = Math.floor(boundaryLongitude / 30) % ZODIAC_SIGNS.length;
    const fromSignIndex = (toSignIndex - 1 + ZODIAC_SIGNS.length) % ZODIAC_SIGNS.length;

    return before < after
      ? {
          fromSign: ZODIAC_SIGNS[fromSignIndex],
          toSign: ZODIAC_SIGNS[toSignIndex],
          direction: 'direct',
        }
      : {
          fromSign: ZODIAC_SIGNS[toSignIndex],
          toSign: ZODIAC_SIGNS[fromSignIndex],
          direction: 'retrograde',
        };
  }

  private signedBoundaryOffset(
    planetId: number,
    jd: number,
    boundaryLongitude: number
  ): -1 | 0 | 1 {
    const longitude = this.ephem.getPlanetPosition(planetId, jd).longitude;
    let diff = normalizeLongitude(longitude) - normalizeLongitude(boundaryLongitude);
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 1e-6) {
      return 0;
    }
    return diff > 0 ? 1 : -1;
  }
}
