import type { ElectionalFixture } from '../../utils/fixtureTypes.js';

export const electionalFixtures: ElectionalFixture[] = [
  {
    name: 'san-francisco-clear-day',
    input: {
      date: '2026-03-28',
      time: '13:00',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      include_ruler_basics: true,
    },
    expected: {
      classification: 'day',
      isDayChart: true,
      houseSystem: 'P',
      rawSunAltitudeSign: 'positive',
      hasApplyingAspects: true,
      hasMoonApplyingAspects: true,
      hasRulerBasics: true,
    },
  },
  {
    name: 'san-francisco-clear-night',
    input: {
      date: '2026-03-28',
      time: '23:00',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
    },
    expected: {
      classification: 'night',
      isDayChart: false,
      houseSystem: 'P',
      rawSunAltitudeSign: 'negative',
      hasApplyingAspects: true,
      hasMoonApplyingAspects: true,
      hasRulerBasics: false,
    },
  },
  {
    name: 'san-francisco-horizon-boundary-negative-rounds-to-zero',
    input: {
      date: '2026-03-28',
      time: '07:04:57',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
    },
    expected: {
      classification: 'night',
      isDayChart: false,
      rawSunAltitudeSign: 'negative',
      sunAltitudeDisplaysZero: true,
      warningsContain: [
        'Sun is near the horizon; day/night classification is close to the boundary.',
      ],
      hasApplyingAspects: true,
      hasMoonApplyingAspects: true,
      hasRulerBasics: false,
    },
  },
  {
    name: 'tromso-house-fallback-and-omitted-optionals',
    input: {
      date: '2026-06-21',
      time: '12:00',
      timezone: 'Europe/Oslo',
      latitude: 69.6492,
      longitude: 18.9553,
      house_system: 'P',
      include_planetary_applications: false,
      include_ruler_basics: false,
    },
    expected: {
      classification: 'day',
      isDayChart: true,
      houseSystem: 'W',
      rawSunAltitudeSign: 'positive',
      warningsContain: ['House calculation fell back from P to W for this location.'],
      hasApplyingAspects: false,
      hasMoonApplyingAspects: false,
      hasRulerBasics: false,
    },
  },
];
