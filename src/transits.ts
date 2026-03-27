import { EphemerisCalculator } from './ephemeris.js';
import { Transit, ASPECTS, PlanetPosition, NatalChart } from './types.js';

// Constants for transit calculations
const EXACT_TIME_ORB_THRESHOLD = 2; // degrees - only calculate exact times within this orb
const EXACT_TIME_SEARCH_WINDOW = 5; // days - search window for exact transit time
const UPCOMING_TRANSITS_ORB_FILTER = 2; // degrees - filter for upcoming transits

export class TransitCalculator {
  private ephem: EphemerisCalculator;

  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  findTransits(
    transitingPlanets: PlanetPosition[],
    natalPlanets: PlanetPosition[],
    currentJD: number
  ): Transit[] {
    const transits: Transit[] = [];

    for (const transitPlanet of transitingPlanets) {
      for (const natalPlanet of natalPlanets) {
        const angle = this.ephem.calculateAspectAngle(
          transitPlanet.longitude,
          natalPlanet.longitude
        );

        for (const aspect of ASPECTS) {
          const orb = Math.abs(angle - aspect.angle);
          
          if (orb <= aspect.orb) {
            const isApplying = this.isApplying(
              transitPlanet.longitude,
              natalPlanet.longitude,
              transitPlanet.speed,
              aspect.angle
            );

            let exactTime: Date | undefined;
            if (orb < EXACT_TIME_ORB_THRESHOLD) {
              const targetLon = this.calculateTargetLongitude(
                natalPlanet.longitude,
                aspect.angle
              );
              const exactJD = this.ephem.findExactTransitTime(
                this.getPlanetIdByName(transitPlanet.planet),
                targetLon,
                currentJD - EXACT_TIME_SEARCH_WINDOW,
                currentJD + EXACT_TIME_SEARCH_WINDOW
              );
              if (exactJD) {
                exactTime = this.ephem.julianDayToDate(exactJD);
              }
            }

            transits.push({
              transitingPlanet: transitPlanet.planet,
              natalPlanet: natalPlanet.planet,
              aspect: aspect.name,
              orb,
              exactTime,
              isApplying,
              transitLongitude: transitPlanet.longitude,
              natalLongitude: natalPlanet.longitude
            });
          }
        }
      }
    }

    return transits.sort((a, b) => a.orb - b.orb);
  }

  private isApplying(
    transitLon: number,
    natalLon: number,
    speed: number,
    aspectAngle: number
  ): boolean {
    if (speed === 0) return false;
    
    const currentAngle = this.ephem.calculateAspectAngle(transitLon, natalLon);
    const futureAngle = this.ephem.calculateAspectAngle(transitLon + speed, natalLon);
    
    return Math.abs(futureAngle - aspectAngle) < Math.abs(currentAngle - aspectAngle);
  }

  private calculateTargetLongitude(natalLon: number, aspectAngle: number): number {
    let target = (natalLon + aspectAngle) % 360;
    if (target < 0) target += 360;
    return target;
  }

  private getPlanetIdByName(name: string): number {
    const planetMap: { [key: string]: number } = {
      'Sun': 0, 'Moon': 1, 'Mercury': 2, 'Venus': 3, 'Mars': 4,
      'Jupiter': 5, 'Saturn': 6, 'Uranus': 7, 'Neptune': 8, 'Pluto': 9
    };
    return planetMap[name] || 0;
  }

  getUpcomingTransits(
    transitingPlanetIds: number[],
    natalChart: NatalChart,
    daysAhead: number = 7
  ): Transit[] {
    const now = new Date();
    const allTransits: Transit[] = [];

    for (let day = 0; day <= daysAhead; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      const jd = this.ephem.dateToJulianDay(date);
      
      const transitingPlanets = this.ephem.getAllPlanets(jd, transitingPlanetIds);
      const transits = this.findTransits(transitingPlanets, natalChart.planets || [], jd);
      
      allTransits.push(...transits);
    }

    const uniqueTransits = this.deduplicateTransits(allTransits);
    return uniqueTransits.filter(t => t.orb <= UPCOMING_TRANSITS_ORB_FILTER);
  }

  private deduplicateTransits(transits: Transit[]): Transit[] {
    const seen = new Set<string>();
    return transits.filter(t => {
      const key = `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
