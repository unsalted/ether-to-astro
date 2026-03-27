import { EclipseCalculator } from '../../../src/eclipses.js';
import { EphemerisCalculator } from '../../../src/ephemeris.js';
import { HouseCalculator } from '../../../src/houses.js';
import { RiseSetCalculator } from '../../../src/riseset.js';
import { TransitCalculator } from '../../../src/transits.js';
import type { PlanetPosition, Transit } from '../../../src/types.js';
import {
  type NormalizedBody,
  type NormalizedEclipse,
  type NormalizedHouseResult,
  type NormalizedRiseSet,
  type NormalizedRoot,
  type NormalizedTransit,
} from '../utils/fixtureTypes.js';

export class InternalValidationAdapter {
  readonly ephem: EphemerisCalculator;
  readonly houseCalc: HouseCalculator;
  readonly transitCalc: TransitCalculator;
  readonly riseSetCalc: RiseSetCalculator;
  readonly eclipseCalc: EclipseCalculator;

  private constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
    this.houseCalc = new HouseCalculator(ephem);
    this.transitCalc = new TransitCalculator(ephem);
    this.riseSetCalc = new RiseSetCalculator(ephem);
    this.eclipseCalc = new EclipseCalculator(ephem);
  }

  static async create(): Promise<InternalValidationAdapter> {
    const ephem = new EphemerisCalculator();
    await ephem.init();
    return new InternalValidationAdapter(ephem);
  }

  getPositions(isoUtc: string, planetIds: number[]): NormalizedBody[] {
    const jd = this.ephem.dateToJulianDay(new Date(isoUtc));
    return this.ephem.getAllPlanets(jd, planetIds).map((p) => this.normalizeBody(p));
  }

  getHouseResult(
    isoUtc: string,
    latitude: number,
    longitude: number,
    houseSystem: string
  ): NormalizedHouseResult {
    const jd = this.ephem.dateToJulianDay(new Date(isoUtc));
    const result = this.houseCalc.calculateHouses(jd, latitude, longitude, houseSystem);
    return {
      system: result.system,
      ascendant: result.ascendant,
      mc: result.mc,
      cusps: result.cusps.slice(1),
    };
  }

  getTransitsFromOffsets(input: {
    currentIsoUtc: string;
    transitingPlanetId: number;
    natalPlanetId: number;
    natalOffsetDegrees: number;
  }): NormalizedTransit[] {
    const currentJD = this.ephem.dateToJulianDay(new Date(input.currentIsoUtc));
    const transiting = this.ephem.getPlanetPosition(input.transitingPlanetId, currentJD);

    const natal: PlanetPosition = {
      planetId: input.natalPlanetId,
      planet: this.ephem.getPlanetPosition(input.natalPlanetId, currentJD).planet,
      longitude: (transiting.longitude + input.natalOffsetDegrees + 360) % 360,
      latitude: 0,
      distance: 1,
      speed: 1,
      sign: 'Aries',
      degree: 0,
      isRetrograde: false,
    };

    return this.transitCalc
      .findTransits([transiting], [natal], currentJD)
      .map((t) => this.normalizeTransit(t));
  }

  getTransits(transitingPlanets: PlanetPosition[], natalPlanets: PlanetPosition[], currentIsoUtc: string): NormalizedTransit[] {
    const currentJD = this.ephem.dateToJulianDay(new Date(currentIsoUtc));
    return this.transitCalc.findTransits(transitingPlanets, natalPlanets, currentJD).map((t) => this.normalizeTransit(t));
  }

  getExactRoots(planetId: number, targetLongitude: number, startIsoUtc: string, endIsoUtc: string): NormalizedRoot[] {
    const startJD = this.ephem.dateToJulianDay(new Date(startIsoUtc));
    const endJD = this.ephem.dateToJulianDay(new Date(endIsoUtc));
    const roots = this.ephem.findExactTransitTimes(planetId, targetLongitude, startJD, endJD);
    return roots.map((jd) => ({ jd, isoUtc: this.ephem.julianDayToDate(jd).toISOString() }));
  }

  getRiseSet(isoUtc: string, planetId: number, latitude: number, longitude: number): NormalizedRiseSet {
    const jd = this.ephem.dateToJulianDay(new Date(isoUtc));
    const result = this.riseSetCalc.calculateRiseSet(jd, planetId, latitude, longitude);
    return {
      body: result.planet,
      rise: result.rise?.toISOString(),
      set: result.set?.toISOString(),
      upperMeridianTransit: result.upperMeridianTransit?.toISOString(),
      lowerMeridianTransit: result.lowerMeridianTransit?.toISOString(),
    };
  }

  getNextEclipse(startIsoUtc: string, type: 'solar' | 'lunar'): NormalizedEclipse | null {
    const startJD = this.ephem.dateToJulianDay(new Date(startIsoUtc));
    const result = type === 'solar'
      ? this.eclipseCalc.findNextSolarEclipse(startJD)
      : this.eclipseCalc.findNextLunarEclipse(startJD);

    if (!result) {
      return null;
    }

    return {
      type: result.type,
      eclipseType: result.eclipseType,
      maxTime: result.maxTime.toISOString(),
    };
  }

  canComputeRiseSet(): boolean {
    try {
      const probeJd = this.ephem.dateToJulianDay(new Date('2024-03-26T12:00:00Z'));
      this.riseSetCalc.calculateRiseSet(probeJd, 0, 34.0522, -118.2437);
      return true;
    } catch (error) {
      return !String(error).includes('is not a function');
    }
  }

  canComputeEclipses(): boolean {
    try {
      const probeJd = this.ephem.dateToJulianDay(new Date('2024-03-26T00:00:00Z'));
      const eph = this.ephem.eph as
        | {
            swe_sol_eclipse_when_glob: (jd: number, iflag: number, ifltype: number, backwards: boolean) => unknown;
            swe_lun_eclipse_when: (jd: number, iflag: number, ifltype: number, backwards: boolean) => unknown;
          }
        | null;
      eph?.swe_sol_eclipse_when_glob(probeJd, 0, 0, false);
      eph?.swe_lun_eclipse_when(probeJd, 0, 0, false);
      return true;
    } catch (error) {
      return !String(error).includes('is not a function');
    }
  }

  normalizeBody(p: PlanetPosition): NormalizedBody {
    return {
      body: p.planet,
      longitude: p.longitude,
      latitude: p.latitude,
      speed: p.speed,
      retrograde: p.isRetrograde,
    };
  }

  normalizeTransit(t: Transit): NormalizedTransit {
    return {
      transitingPlanet: t.transitingPlanet,
      natalPlanet: t.natalPlanet,
      aspect: t.aspect,
      orb: t.orb,
      exactTime: t.exactTime?.toISOString(),
      exactTimeStatus: t.exactTimeStatus,
      isApplying: t.isApplying,
    };
  }
}
