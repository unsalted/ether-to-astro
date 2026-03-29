import { describe, expect, it, vi } from 'vitest';
import { ElectionalService } from '../../../src/astro-service/electional-service.js';
import type { PlanetPosition } from '../../../src/types.js';

function makePlanet(planet: PlanetPosition['planet'], longitude: number): PlanetPosition {
  return {
    planetId: 0,
    planet,
    longitude,
    latitude: 0,
    distance: 1,
    speed: 1,
    sign: 'Aries',
    degree: longitude % 30,
    isRetrograde: false,
  };
}

function makeElectionalService() {
  const ephem = {
    dateToJulianDay: vi.fn((date: Date) => date.getTime() / 86400000 + 2440587.5),
    calculateAspectAngle: vi.fn((a: number, b: number) => {
      const diff = Math.abs(a - b);
      return diff > 180 ? 360 - diff : diff;
    }),
    getHorizontalCoordinates: vi.fn(() => ({
      azimuth: 180,
      trueAltitude: 25,
      apparentAltitude: 25,
    })),
    getAllPlanets: vi.fn(() => [
      { ...makePlanet('Sun', 0), sign: 'Aries', speed: 1 },
      { ...makePlanet('Moon', 58), sign: 'Taurus', speed: 13 },
      { ...makePlanet('Mercury', 120), sign: 'Leo', speed: 1.2 },
      { ...makePlanet('Venus', 180), sign: 'Libra', speed: 1.1 },
      { ...makePlanet('Mars', 240), sign: 'Sagittarius', speed: 0.7 },
      { ...makePlanet('Jupiter', 300), sign: 'Aquarius', speed: 0.2 },
      { ...makePlanet('Saturn', 315), sign: 'Aquarius', speed: 0.05, isRetrograde: true },
      { ...makePlanet('Uranus', 30), sign: 'Taurus', speed: 0.03 },
      { ...makePlanet('Neptune', 330), sign: 'Pisces', speed: 0.02 },
      { ...makePlanet('Pluto', 270), sign: 'Capricorn', speed: 0.01 },
    ]),
  };
  const houseCalc = {
    calculateHouses: vi.fn(() => ({
      ascendant: 270,
      mc: 204,
      cusps: [0, 270, 300, 330, 0, 30, 60, 90, 120, 150, 204, 240, 260],
      system: 'W' as const,
    })),
  };

  const electionalService = new ElectionalService({
    ephem: ephem as any,
    houseCalc: houseCalc as any,
  });

  return { electionalService, ephem, houseCalc };
}

describe('When using the extracted ElectionalService', () => {
  it('Given deterministic inputs, then it preserves electional context payloads and optional summaries', () => {
    const { electionalService } = makeElectionalService();

    const result = electionalService.getElectionalContext({
      date: '2026-03-28',
      time: '09:30',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      include_ruler_basics: true,
    });

    expect(result.data).toMatchObject({
      input: {
        date: '2026-03-28',
        time: '09:30',
        timezone: 'America/Los_Angeles',
        house_system: 'W',
      },
      ascendant: {
        sign: 'Capricorn',
      },
      sect: {
        is_day_chart: true,
        classification: 'day',
        sun_altitude_degrees: 25,
      },
      moon: {
        sign: 'Taurus',
        phase_name: 'crescent',
        is_void_of_course: null,
      },
      ruler_basics: {
        asc_sign_ruler: {
          body: 'Saturn',
          sign: 'Aquarius',
          is_retrograde: true,
        },
      },
    });
    expect((result.data as any).applying_aspects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from_body: 'Sun',
          to_body: 'Moon',
          aspect: 'sextile',
          applying: true,
        }),
      ])
    );
    expect((result.data as any).meta.warnings).toContain(
      'House calculation fell back from P to W for this location.'
    );
    expect(result.text).toContain('Applying Aspects:');
  });

  it('Given DST-overlap or invalid orb inputs, then it preserves strict validation semantics', () => {
    const { electionalService } = makeElectionalService();

    expect(() =>
      electionalService.getElectionalContext({
        date: '2026-11-01',
        time: '01:30',
        timezone: 'America/Los_Angeles',
        latitude: 37.7749,
        longitude: -122.4194,
      })
    ).toThrow(/ambiguous or nonexistent due to a DST transition/);

    expect(() =>
      electionalService.getElectionalContext({
        date: '2026-03-28',
        time: '09:30',
        timezone: 'UTC',
        latitude: 37.7749,
        longitude: -122.4194,
        orb_degrees: 11,
      })
    ).toThrow(/Invalid orb_degrees/);
  });

  it('Given applying-aspect toggles and invalid clock input, then it preserves the raw electional contract', () => {
    const { electionalService, ephem } = makeElectionalService();
    ephem.getAllPlanets.mockReturnValue([
      { ...makePlanet('Sun', 0), sign: 'Aries', speed: 1 },
      { ...makePlanet('Moon', 120), sign: 'Leo', speed: 1 },
      { ...makePlanet('Mercury', 210), sign: 'Scorpio', speed: 1 },
      { ...makePlanet('Venus', 300), sign: 'Aquarius', speed: 1 },
      { ...makePlanet('Mars', 45), sign: 'Taurus', speed: 1 },
      { ...makePlanet('Jupiter', 90), sign: 'Cancer', speed: 0.1 },
      { ...makePlanet('Saturn', 180), sign: 'Libra', speed: 0.1 },
      { ...makePlanet('Uranus', 240), sign: 'Sagittarius', speed: 0.1 },
      { ...makePlanet('Neptune', 270), sign: 'Capricorn', speed: 0.1 },
      { ...makePlanet('Pluto', 330), sign: 'Pisces', speed: 0.1 },
    ]);

    const result = electionalService.getElectionalContext({
      date: '2026-03-28',
      time: '09:30:15',
      timezone: 'UTC',
      latitude: 40.7,
      longitude: -74,
      include_planetary_applications: false,
    });

    expect((result.data as any).applying_aspects).toBeUndefined();
    expect((result.data as any).moon.applying_aspects).toBeUndefined();
    expect((result.data as any).ruler_basics).toBeUndefined();
    expect(result.text).not.toContain('Applying Aspects:');

    expect(() =>
      electionalService.getElectionalContext({
        date: '2026-03-28',
        time: '25:61',
        timezone: 'UTC',
        latitude: 40.7,
        longitude: -74,
      })
    ).toThrow(/Invalid clock time/);
  });
});
