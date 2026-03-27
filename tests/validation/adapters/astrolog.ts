import { spawnSync } from 'node:child_process';
import type { NormalizedBody } from '../utils/fixtureTypes.js';

const BODY_NAMES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

export interface AstrologProbe {
  enabled: boolean;
  available: boolean;
  bin: string;
  reason?: string;
}

export function probeAstrolog(): AstrologProbe {
  const enabled = process.env.VALIDATE_WITH_ASTROLOG === '1';
  const bin = process.env.ASTROLOG_BIN || 'astrolog';

  if (!enabled) {
    return { enabled: false, available: false, bin, reason: 'VALIDATE_WITH_ASTROLOG is not enabled' };
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
    const tableMatch = line.match(/^(Sun|Moon|Merc|Venu|Mars|Jupi|Satu|Uran|Nept|Plut)\s*:\s*([0-9]{1,2})([A-Za-z]{3})([0-9]{1,2})/i);
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
      const signOrder = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
      const body = bodyMap[tableMatch[1]];
      const degree = Number(tableMatch[2]);
      const signIndex = signOrder.indexOf(tableMatch[3]);
      const minutes = Number(tableMatch[4]);
      if (body && signIndex >= 0) {
        parsed.push({
          body,
          longitude: signIndex * 30 + degree + minutes / 60,
        });
      }
      continue;
    }

    // Example-ish line formats across Astrolog builds often include:
    // "Sun  6Ar19  ..." or "Sun 6.32"
    const plainMatch = line.match(/^(Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto)\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (plainMatch) {
      parsed.push({ body: plainMatch[1], longitude: Number(plainMatch[2]) });
      continue;
    }

    const zodiacMatch = line.match(/^(Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto)\s+([0-9]{1,2})([A-Za-z]{2})([0-9]{1,2})/i);
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

  return BODY_NAMES
    .map((body) => byBody.get(body))
    .filter((row): row is NormalizedBody => Boolean(row));
}

export function getAstrologPositions(isoUtc: string, probe: AstrologProbe): { ok: boolean; positions?: NormalizedBody[]; reason?: string } {
  if (!probe.enabled || !probe.available) {
    return { ok: false, reason: probe.reason || 'Astrolog not available' };
  }

  const d = new Date(isoUtc);
  // Astrolog `-q` in this build parses input in its default fixed zone (shown as ST Zone 8W).
  // Convert UTC to that clock basis so we compare the same instant.
  const astrologClock = new Date(d.getTime() - 8 * 60 * 60 * 1000);
  const month = astrologClock.getUTCMonth() + 1;
  const day = astrologClock.getUTCDate();
  const year = astrologClock.getUTCFullYear();
  const hour = String(astrologClock.getUTCHours()).padStart(2, '0');
  const minute = String(astrologClock.getUTCMinutes()).padStart(2, '0');

  // Astrolog CLI flags vary by build. Try a few minimal templates.
  const argSets = [
    ['-q', String(month), String(day), String(year), `${hour}:${minute}`],
    ['-q', '-d', `${month}/${day}/${year}`, '-t', `${hour}:${minute}`, '-z', '0'],
    ['-q', `${month}/${day}/${year}`, `${hour}:${minute}`],
    ['-q'],
  ];

  for (const args of argSets) {
    const result = spawnSync(probe.bin, args, { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      continue;
    }

    const parsed = parsePositionsFromStdout(result.stdout);
    if (parsed.length >= 5) {
      return { ok: true, positions: parsed };
    }
  }

  return {
    ok: false,
    reason: 'Astrolog is installed but output parsing/flags did not yield usable position rows',
  };
}
