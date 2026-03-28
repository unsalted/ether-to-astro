import { spawnSync } from 'node:child_process';
import type { NormalizedBody, NormalizedHouseResult } from '../utils/fixtureTypes.js';

const BODY_NAMES = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];

export interface AstrologProbe {
  enabled: boolean;
  available: boolean;
  bin: string;
  reason?: string;
}

interface AstrologRunOptions {
  longitude?: number;
  latitude?: number;
  houseSystem?: 'P' | 'W';
}

export function probeAstrolog(): AstrologProbe {
  const enabled = process.env.VALIDATE_WITH_ASTROLOG === '1';
  const bin = process.env.ASTROLOG_BIN || 'astrolog';

  if (!enabled) {
    return {
      enabled: false,
      available: false,
      bin,
      reason: 'VALIDATE_WITH_ASTROLOG is not enabled',
    };
  }

  const probe = spawnSync(bin, ['-Hc'], { encoding: 'utf8' });
  const probeText = `${probe.stdout || ''}\n${probe.stderr || ''}`;
  if (probe.error || (probe.status !== 0 && !/Astrolog\s+version/i.test(probeText))) {
    return {
      enabled,
      available: false,
      bin,
      reason: probe.error?.message || probe.stderr || `Exit ${probe.status}`,
    };
  }

  return { enabled, available: true, bin };
}

function parsePositionsFromStdout(stdout: string): NormalizedBody[] {
  const lines = stdout.split(/\r?\n/);
  const parsed: NormalizedBody[] = [];

  for (const line of lines) {
    // Common Astrolog table line format:
    // "Sun :  6Ari38 ..."
    const tableMatch = line.match(
      /^(Sun|Moon|Merc|Venu|Mars|Jupi|Satu|Uran|Nept|Plut)\s*:\s*([0-9]{1,2})([A-Za-z]{3})([0-9]{1,2})\s*(R?)\s*[+-]/i
    );
    if (tableMatch) {
      const bodyMap: Record<string, string> = {
        Sun: 'Sun',
        Moon: 'Moon',
        Merc: 'Mercury',
        Venu: 'Venus',
        Mars: 'Mars',
        Jupi: 'Jupiter',
        Satu: 'Saturn',
        Uran: 'Uranus',
        Nept: 'Neptune',
        Plut: 'Pluto',
      };
      const signOrder = [
        'Ari',
        'Tau',
        'Gem',
        'Can',
        'Leo',
        'Vir',
        'Lib',
        'Sco',
        'Sag',
        'Cap',
        'Aqu',
        'Pis',
      ];
      const body = bodyMap[tableMatch[1]];
      const degree = Number(tableMatch[2]);
      const signIndex = signOrder.indexOf(tableMatch[3]);
      const minutes = Number(tableMatch[4]);
      if (body && signIndex >= 0) {
        parsed.push({
          body,
          longitude: signIndex * 30 + degree + minutes / 60,
          retrograde: tableMatch[5] === 'R',
        });
      }
      continue;
    }

    // Example-ish line formats across Astrolog builds often include:
    // "Sun  6Ar19  ..." or "Sun 6.32"
    const plainMatch = line.match(
      /^(Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto)\s+([0-9]+(?:\.[0-9]+)?)/i
    );
    if (plainMatch) {
      parsed.push({ body: plainMatch[1], longitude: Number(plainMatch[2]) });
      continue;
    }

    const zodiacMatch = line.match(
      /^(Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto)\s+([0-9]{1,2})([A-Za-z]{2})([0-9]{1,2})/i
    );
    if (zodiacMatch) {
      const signOrder = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];
      const degree = Number(zodiacMatch[2]);
      const sign = zodiacMatch[3];
      const minutes = Number(zodiacMatch[4]);
      const signIndex = signOrder.indexOf(sign);
      if (signIndex >= 0) {
        parsed.push({
          body: zodiacMatch[1],
          longitude: signIndex * 30 + degree + minutes / 60,
        });
      }
    }
  }

  // Keep only one row per body.
  const byBody = new Map<string, NormalizedBody>();
  for (const row of parsed) {
    if (!byBody.has(row.body)) byBody.set(row.body, row);
  }

  return BODY_NAMES.map((body) => byBody.get(body)).filter((row): row is NormalizedBody =>
    Boolean(row)
  );
}

function toAstrologCoord(
  value: number,
  positiveHemisphere: string,
  negativeHemisphere: string
): string {
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  let minutes = Math.round((abs - degrees) * 60);
  if (minutes === 60) {
    degrees += 1;
    minutes = 0;
  }
  const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere;
  return `${degrees}${hemisphere}${String(minutes).padStart(2, '0')}`;
}

function runAstrologChart(
  isoUtc: string,
  probe: AstrologProbe,
  options: AstrologRunOptions = {}
): { ok: boolean; stdout?: string; reason?: string } {
  if (!probe.enabled || !probe.available) {
    return { ok: false, reason: probe.reason ?? 'Astrolog not available' };
  }

  const d = new Date(isoUtc);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const minute = String(d.getUTCMinutes()).padStart(2, '0');
  const longitude = options.longitude ?? 0;
  const latitude = options.latitude ?? 0;
  const lonToken = toAstrologCoord(longitude, 'E', 'W');
  const latToken = toAstrologCoord(latitude, 'N', 'S');

  const args = [
    '-qa',
    String(month),
    String(day),
    String(year),
    `${hour}:${minute}`,
    '0',
    lonToken,
    latToken,
  ];

  if (options.houseSystem === 'W') {
    args.push('-c', '14');
  } else if (options.houseSystem === 'P') {
    args.push('-c', '0');
  }

  const result = spawnSync(probe.bin, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      reason: result.error?.message || result.stderr || `Exit ${result.status}`,
    };
  }

  return { ok: true, stdout: result.stdout };
}

function parseHouseSystem(stdout: string): 'P' | 'W' | null {
  const match = stdout.match(/(Placidus|Whole)\s+Houses/i);
  if (!match) return null;
  if (match[1].toLowerCase() === 'whole') return 'W';
  return 'P';
}

function parseHouseCusps(stdout: string): number[] {
  const cusps: number[] = new Array(12).fill(Number.NaN);
  const signOrder = [
    'Ari',
    'Tau',
    'Gem',
    'Can',
    'Leo',
    'Vir',
    'Lib',
    'Sco',
    'Sag',
    'Cap',
    'Aqu',
    'Pis',
  ];

  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/House cusp\s+(\d+):\s+([0-9]{1,2})([A-Za-z]{3})([0-9]{1,2})/i);
    if (!m) continue;
    const cuspIndex = Number(m[1]);
    if (cuspIndex < 1 || cuspIndex > 12) continue;
    const degree = Number(m[2]);
    const signIndex = signOrder.indexOf(m[3]);
    const minutes = Number(m[4]);
    if (signIndex < 0) continue;
    cusps[cuspIndex - 1] = signIndex * 30 + degree + minutes / 60;
  }

  return cusps;
}

export function getAstrologPositions(
  isoUtc: string,
  probe: AstrologProbe
): { ok: boolean; positions?: NormalizedBody[]; reason?: string } {
  const chart = runAstrologChart(isoUtc, probe);
  if (!chart.ok || !chart.stdout) {
    return { ok: false, reason: chart.reason };
  }

  const parsed = parsePositionsFromStdout(chart.stdout);
  if (parsed.length >= 5) {
    return { ok: true, positions: parsed };
  }

  return {
    ok: false,
    reason: 'Astrolog is installed but output parsing/flags did not yield usable position rows',
  };
}

export function getAstrologHouses(
  input: {
    isoUtc: string;
    latitude: number;
    longitude: number;
    houseSystem: 'P' | 'W';
  },
  probe: AstrologProbe
): { ok: boolean; houses?: NormalizedHouseResult; reason?: string } {
  const chart = runAstrologChart(input.isoUtc, probe, {
    latitude: input.latitude,
    longitude: input.longitude,
    houseSystem: input.houseSystem,
  });
  if (!chart.ok || !chart.stdout) {
    return { ok: false, reason: chart.reason };
  }

  const cusps = parseHouseCusps(chart.stdout);
  if (cusps.some((c) => !Number.isFinite(c))) {
    return { ok: false, reason: 'Could not parse all 12 house cusps from Astrolog output' };
  }

  const system = parseHouseSystem(chart.stdout) ?? input.houseSystem;
  return {
    ok: true,
    houses: {
      system,
      cusps,
      // Astrolog textual chart output doesn't expose explicit ASC/MC values;
      // use cusp 1/10 proxies for parity sanity.
      ascendant: cusps[0],
      mc: cusps[9],
    },
  };
}
