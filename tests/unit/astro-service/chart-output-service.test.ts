import { describe, expect, it, vi } from 'vitest';
import { ChartOutputService } from '../../../src/astro-service/chart-output-service.js';
import type { NatalChart, PlanetPosition } from '../../../src/types.js';

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

function makeNatalChart(): NatalChart {
  return {
    name: 'Test User',
    birthDate: { year: 1990, month: 6, day: 12, hour: 14, minute: 35 },
    location: { latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles' },
    planets: [makePlanet('Sun', 10), makePlanet('Moon', 20)],
    julianDay: 2451545,
    houseSystem: 'P',
    utcDateTime: { year: 1990, month: 6, day: 12, hour: 21, minute: 35 },
  };
}

function makeChartOutputService() {
  const chartRenderer = {
    generateNatalChart: vi.fn(async (_chart, _theme, format) => {
      if (format === 'svg') return '<svg>ok</svg>';
      return Buffer.from([1, 2, 3]);
    }),
    generateTransitChart: vi.fn(async (_chart, _date, _theme, format) => {
      if (format === 'svg') return '<svg>transit</svg>';
      return Buffer.from([4, 5, 6]);
    }),
  };
  const now = vi.fn(() => new Date('2024-03-26T12:00:00Z'));
  const writeFile = vi.fn(async () => {});

  const chartOutputService = new ChartOutputService({
    chartRenderer: chartRenderer as any,
    now,
    writeFile,
  });

  return { chartOutputService, chartRenderer, now, writeFile };
}

describe('When using the extracted ChartOutputService', () => {
  it('Given inline render requests, then it preserves SVG and binary output serialization', async () => {
    const { chartOutputService } = makeChartOutputService();

    const inlineSvg = await chartOutputService.generateNatalChart(makeNatalChart(), { format: 'svg' });
    expect(inlineSvg).toMatchObject({
      format: 'svg',
      text: 'Natal Chart for Test User:',
      svg: '<svg>ok</svg>',
    });

    const inlinePng = await chartOutputService.generateNatalChart(makeNatalChart(), { format: 'png' });
    expect(inlinePng).toMatchObject({
      format: 'png',
      image: {
        data: Buffer.from([1, 2, 3]).toString('base64'),
        mimeType: 'image/png',
      },
    });
  });

  it('Given transit chart output paths and dates, then it preserves saved-file and label behavior', async () => {
    const { chartOutputService, writeFile } = makeChartOutputService();

    const saved = await chartOutputService.generateTransitChart(makeNatalChart(), {
      format: 'webp',
      output_path: '/tmp/test.webp',
      date: '2024-03-26',
    });

    expect(writeFile).toHaveBeenCalledWith('/tmp/test.webp', Buffer.from([4, 5, 6]));
    expect(saved.text).toContain('Transit Chart for Test User');
    expect(saved.text).toContain('/tmp/test.webp');
  });

  it('Given transit SVG output, then it preserves the inline SVG branch', async () => {
    const { chartOutputService } = makeChartOutputService();

    const result = await chartOutputService.generateTransitChart(makeNatalChart(), {
      format: 'svg',
      date: '2024-03-26',
    });

    expect(result).toMatchObject({
      format: 'svg',
      svg: '<svg>transit</svg>',
    });
  });
});
