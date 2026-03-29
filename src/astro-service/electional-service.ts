import { Temporal } from '@js-temporal/polyfill';
import type { EphemerisCalculator } from '../ephemeris.js';
import type { HouseCalculator } from '../houses.js';
import { localToUTC } from '../time-utils.js';
import {
  ASPECTS,
  type ElectionalAspect,
  type ElectionalContextResponse,
  type ElectionalHouseSystem,
  type ElectionalPhaseName,
  PLANETS,
  type PlanetName,
  type PlanetPosition,
  ZODIAC_SIGNS,
} from '../types.js';
import { parseDateOnlyInput } from './date-input.js';
import { normalizeLongitude } from './shared.js';

interface ElectionalContextInput {
  date: string;
  time: string;
  timezone: string;
  latitude: number;
  longitude: number;
  house_system?: ElectionalHouseSystem;
  include_ruler_basics?: boolean;
  include_planetary_applications?: boolean;
  orb_degrees?: number;
}

interface ElectionalServiceResult {
  data: Record<string, unknown>;
  text: string;
}

interface ElectionalServiceDependencies {
  ephem: EphemerisCalculator;
  houseCalc: HouseCalculator;
}

const ELECTIONAL_CONTEXT_PLANET_IDS = [
  PLANETS.SUN,
  PLANETS.MOON,
  PLANETS.MERCURY,
  PLANETS.VENUS,
  PLANETS.MARS,
  PLANETS.JUPITER,
  PLANETS.SATURN,
  PLANETS.URANUS,
  PLANETS.NEPTUNE,
  PLANETS.PLUTO,
];

const ELECTIONAL_CONTEXT_HOUSE_SYSTEMS: ElectionalHouseSystem[] = ['P', 'K', 'W', 'R'];

/**
 * Internal electional workflow used by `AstroService`.
 *
 * @remarks
 * This module owns validation, deterministic instant resolution, sect/moon
 * metadata, optional applying-aspect summaries, and readable electional text
 * while the `AstroService` facade keeps the public contract stable.
 */
export class ElectionalService {
  private readonly ephem: EphemerisCalculator;
  private readonly houseCalc: HouseCalculator;

  constructor(deps: ElectionalServiceDependencies) {
    this.ephem = deps.ephem;
    this.houseCalc = deps.houseCalc;
  }

  /**
   * Produce deterministic electional context for a single local instant.
   */
  getElectionalContext(input: ElectionalContextInput): ElectionalServiceResult {
    if (input.latitude < -90 || input.latitude > 90) {
      throw new Error(`Invalid latitude: ${input.latitude} (must be between -90 and 90)`);
    }
    if (input.longitude < -180 || input.longitude > 180) {
      throw new Error(`Invalid longitude: ${input.longitude} (must be between -180 and 180)`);
    }

    const houseSystem = input.house_system ?? 'P';
    if (!ELECTIONAL_CONTEXT_HOUSE_SYSTEMS.includes(houseSystem)) {
      throw new Error(
        `Invalid house_system: ${houseSystem} (must be one of ${ELECTIONAL_CONTEXT_HOUSE_SYSTEMS.join(', ')})`
      );
    }

    const includeRulerBasics = input.include_ruler_basics ?? false;
    const includePlanetaryApplications = input.include_planetary_applications ?? true;
    const orbDegrees = input.orb_degrees ?? 3;
    if (!Number.isFinite(orbDegrees) || orbDegrees < 0.1 || orbDegrees > 10) {
      throw new Error(`Invalid orb_degrees: ${orbDegrees} (must be between 0.1 and 10)`);
    }

    const parsedDate = parseDateOnlyInput(input.date);
    const parsedTime = parseTimeOnlyInput(input.time);
    let instantUtc: Date;
    try {
      instantUtc = localToUTC(
        {
          year: parsedDate.year,
          month: parsedDate.month,
          day: parsedDate.day,
          hour: parsedTime.hour,
          minute: parsedTime.minute,
          second: parsedTime.second,
        },
        input.timezone,
        'reject'
      );
    } catch (error) {
      if (error instanceof RangeError) {
        throw new Error(
          `Invalid local electional time: ${input.date} ${input.time} in ${input.timezone} is ambiguous or nonexistent due to a DST transition.`
        );
      }
      throw error;
    }

    const jdUt = this.ephem.dateToJulianDay(instantUtc);
    const houses = this.houseCalc.calculateHouses(
      jdUt,
      input.latitude,
      input.longitude,
      houseSystem
    );
    const positions = this.ephem.getAllPlanets(jdUt, ELECTIONAL_CONTEXT_PLANET_IDS);

    const sun = positions.find((position) => position.planet === 'Sun');
    const moon = positions.find((position) => position.planet === 'Moon');
    if (!sun || !moon) {
      throw new Error('Ephemeris failed to compute Sun/Moon positions for electional context.');
    }

    const sunHorizontal = this.ephem.getHorizontalCoordinates(
      jdUt,
      sun,
      input.longitude,
      input.latitude
    );
    const rawSunAltitudeDegrees = sunHorizontal.trueAltitude;
    const sunAltitudeDegrees = Number.parseFloat(rawSunAltitudeDegrees.toFixed(2));
    const isDayChart = rawSunAltitudeDegrees >= 0;

    const applyingAspects = includePlanetaryApplications
      ? this.getElectionalApplyingAspects(positions, orbDegrees)
      : undefined;
    const moonApplyingAspects = applyingAspects?.filter(
      (aspect) => aspect.from_body === 'Moon' || aspect.to_body === 'Moon'
    );

    const phaseAngle = Number.parseFloat(
      normalizeLongitude(moon.longitude - sun.longitude).toFixed(2)
    );
    const warnings: string[] = [];
    if (Math.abs(rawSunAltitudeDegrees) < 0.5) {
      warnings.push('Sun is near the horizon; day/night classification is close to the boundary.');
    }
    warnings.push('Moon void-of-course is deferred in this slice and returns null.');
    if (houses.system !== houseSystem) {
      warnings.push(
        `House calculation fell back from ${houseSystem} to ${houses.system} for this location.`
      );
    }

    const ascLongitude = normalizeLongitude(houses.ascendant);
    const ascSign = ZODIAC_SIGNS[Math.floor(ascLongitude / 30)];
    const response: ElectionalContextResponse = {
      input: {
        date: input.date,
        time: input.time,
        timezone: input.timezone,
        latitude: input.latitude,
        longitude: input.longitude,
        house_system: houses.system as ElectionalHouseSystem,
        instant_utc: instantUtc.toISOString(),
        jd_ut: Number.parseFloat(jdUt.toFixed(8)),
      },
      ascendant: {
        longitude: Number.parseFloat(ascLongitude.toFixed(4)),
        sign: ascSign,
        degree_in_sign: Number.parseFloat((ascLongitude % 30).toFixed(4)),
      },
      sect: {
        is_day_chart: isDayChart,
        sun_altitude_degrees: sunAltitudeDegrees,
        classification: isDayChart ? 'day' : 'night',
      },
      moon: {
        longitude: Number.parseFloat(moon.longitude.toFixed(4)),
        sign: moon.sign,
        phase_angle: phaseAngle,
        phase_name: this.getElectionalPhaseName(phaseAngle),
        is_void_of_course: null,
        ...(moonApplyingAspects !== undefined ? { applying_aspects: moonApplyingAspects } : {}),
      },
      meta: {
        deterministic: true,
        requires_natal: false,
        warnings,
        deferred_features: [
          'robust_void_of_course',
          'detailed_ruler_condition',
          'house_context',
          'natal_overlays',
        ],
      },
    };

    if (applyingAspects) {
      response.applying_aspects = applyingAspects;
    }

    if (includeRulerBasics) {
      const rulerBody = this.getTraditionalSignRuler(ascSign);
      const rulerPosition = positions.find((position) => position.planet === rulerBody);
      if (!rulerPosition) {
        throw new Error(`Ephemeris failed to compute ASC ruler position for ${rulerBody}.`);
      }
      response.ruler_basics = {
        asc_sign_ruler: {
          body: rulerBody,
          longitude: Number.parseFloat(rulerPosition.longitude.toFixed(4)),
          sign: rulerPosition.sign,
          speed: Number.parseFloat(rulerPosition.speed.toFixed(6)),
          is_retrograde: rulerPosition.isRetrograde,
        },
      };
    }

    const humanText = [
      `Electional context for ${input.date} ${input.time} (${input.timezone})`,
      '',
      `Ascendant: ${response.ascendant.degree_in_sign.toFixed(2)}° ${response.ascendant.sign}`,
      `Sect: ${response.sect.classification} (${response.sect.sun_altitude_degrees.toFixed(2)}° Sun altitude)`,
      `Moon: ${response.moon.phase_name} in ${response.moon.sign} (${response.moon.phase_angle.toFixed(2)}° phase angle)`,
    ];

    if (includePlanetaryApplications) {
      const topLevelAspectText =
        applyingAspects && applyingAspects.length > 0
          ? applyingAspects
              .slice(0, 5)
              .map(
                (aspect) =>
                  `${aspect.from_body} ${aspect.aspect} ${aspect.to_body} (${aspect.orb.toFixed(2)}°)`
              )
              .join('\n')
          : 'No applying aspects found within the configured orb.';

      humanText.push('', 'Applying Aspects:', topLevelAspectText);
    }

    if (response.ruler_basics) {
      humanText.push(
        '',
        `ASC Ruler: ${response.ruler_basics.asc_sign_ruler.body} in ${response.ruler_basics.asc_sign_ruler.sign} (${response.ruler_basics.asc_sign_ruler.longitude.toFixed(2)}°)`
      );
    }

    if (warnings.length > 0) {
      humanText.push('', `Warnings: ${warnings.join(' ')}`);
    }

    return {
      data: response as unknown as Record<string, unknown>,
      text: humanText.join('\n'),
    };
  }

  /**
   * Return only currently applying aspects inside the requested orb.
   */
  private getElectionalApplyingAspects(
    positions: PlanetPosition[],
    orbDegrees: number
  ): ElectionalAspect[] {
    const aspects: ElectionalAspect[] = [];

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const from = positions[i];
        const to = positions[j];
        const currentAngle = this.ephem.calculateAspectAngle(from.longitude, to.longitude);

        for (const aspect of ASPECTS) {
          const orb = Math.abs(currentAngle - aspect.angle);
          if (orb > aspect.orb || orb > orbDegrees) {
            continue;
          }

          const applying = this.isElectionalAspectApplying(from, to, aspect.angle);
          if (!applying) {
            continue;
          }

          aspects.push({
            from_body: from.planet,
            to_body: to.planet,
            aspect: aspect.name,
            orb: Number.parseFloat(orb.toFixed(4)),
            applying: true,
          });
        }
      }
    }

    return aspects.sort(
      (a, b) =>
        a.orb - b.orb ||
        a.from_body.localeCompare(b.from_body) ||
        a.to_body.localeCompare(b.to_body) ||
        a.aspect.localeCompare(b.aspect)
    );
  }

  /**
   * Determine whether a near-aspect is applying instead of separating.
   */
  private isElectionalAspectApplying(
    from: Pick<PlanetPosition, 'longitude' | 'speed'>,
    to: Pick<PlanetPosition, 'longitude' | 'speed'>,
    aspectAngle: number
  ): boolean {
    const signedSeparation = this.getSignedAngularDifference(from.longitude, to.longitude);
    const currentSeparation = Math.abs(signedSeparation);
    if (currentSeparation === aspectAngle) {
      return false;
    }

    const separationRate = Math.sign(signedSeparation || 1) * (to.speed - from.speed);
    if (separationRate === 0) {
      return false;
    }

    return currentSeparation < aspectAngle ? separationRate > 0 : separationRate < 0;
  }

  /**
   * Compute the signed shortest angular distance in degrees.
   */
  private getSignedAngularDifference(fromLongitude: number, toLongitude: number): number {
    const normalized = ((toLongitude - fromLongitude + 540) % 360) - 180;
    return normalized === -180 ? 180 : normalized;
  }

  /**
   * Bucket a Sun-Moon phase angle into the service's coarse phase names.
   */
  private getElectionalPhaseName(phaseAngle: number): ElectionalPhaseName {
    if (phaseAngle < 45) return 'new';
    if (phaseAngle < 90) return 'crescent';
    if (phaseAngle < 135) return 'first_quarter';
    if (phaseAngle < 180) return 'gibbous';
    if (phaseAngle < 225) return 'full';
    if (phaseAngle < 270) return 'disseminating';
    if (phaseAngle < 315) return 'last_quarter';
    return 'balsamic';
  }

  /**
   * Return the traditional ruler used for the ascendant sign summary.
   */
  private getTraditionalSignRuler(sign: string): PlanetName {
    const signRulers: Record<string, PlanetName> = {
      Aries: 'Mars',
      Taurus: 'Venus',
      Gemini: 'Mercury',
      Cancer: 'Moon',
      Leo: 'Sun',
      Virgo: 'Mercury',
      Libra: 'Venus',
      Scorpio: 'Mars',
      Sagittarius: 'Jupiter',
      Capricorn: 'Saturn',
      Aquarius: 'Saturn',
      Pisces: 'Jupiter',
    };

    return signRulers[sign] ?? 'Mars';
  }
}

/**
 * Parse a strict local wall-clock time for electional requests.
 */
function parseTimeOnlyInput(timeStr: string): { hour: number; minute: number; second: number } {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!match) {
    throw new Error(`Invalid time format: expected HH:mm[:ss], got "${timeStr}"`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new Error(`Invalid clock time: ${timeStr}`);
  }

  try {
    Temporal.PlainTime.from({ hour, minute, second });
  } catch {
    throw new Error(`Invalid clock time: ${timeStr}`);
  }

  return { hour, minute, second };
}
