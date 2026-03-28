import { minutesToDays, TOLERANCES } from './tolerances.js';

interface Sample {
  jd: number;
  longitude: number;
  shortestDiff: number;
  phi: number; // Unwrapped raw phase (longitude - target), continuous over interval.
}

export interface OracleDebugInfo {
  toleranceDeg: number;
  sampleStepDays: number;
  dedupeEpsilonDays: number;
  samples: Array<{
    jd: number;
    isoUtc?: string;
    longitude: number;
    shortestDiff: number;
    phi: number;
  }>;
  crossings: Array<{
    k: number;
    startJD: number;
    endJD: number;
  }>;
  sanityWarnings: string[];
}

interface OracleOptions {
  toleranceDeg?: number;
  maxStepDays?: number;
  dedupeEpsilonDays?: number;
  maxIterations?: number;
  toIsoUtc?: (jd: number) => string;
}

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function signedShortestDiff(longitude: number, targetLongitude: number): number {
  let diff = normalizeAngle(longitude) - normalizeAngle(targetLongitude);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

function dedupeSortedRoots(roots: number[], epsilonDays: number): number[] {
  const deduped: number[] = [];
  for (const root of roots) {
    const last = deduped[deduped.length - 1];
    if (last == null || Math.abs(root - last) > epsilonDays) {
      deduped.push(root);
    }
  }
  return deduped;
}

function unwrapNextPhi(prevPhi: number, rawPhase: number): number {
  let candidate = rawPhase;
  while (candidate - prevPhi > 180) candidate -= 360;
  while (candidate - prevPhi < -180) candidate += 360;
  return candidate;
}

function enumerateCrossingKs(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const startK = Math.ceil(lo / 360);
  const endK = Math.floor(hi / 360);
  if (startK > endK) return [];

  const ks: number[] = [];
  for (let k = startK; k <= endK; k++) {
    ks.push(k);
  }
  return ks;
}

export function denseScanRootOracle(
  getLongitudeAtJd: (jd: number) => number,
  targetLongitude: number,
  startJD: number,
  endJD: number,
  options: OracleOptions = {}
): number[] {
  return denseScanRootOracleWithDebug(getLongitudeAtJd, targetLongitude, startJD, endJD, options)
    .roots;
}

export function denseScanRootOracleWithDebug(
  getLongitudeAtJd: (jd: number) => number,
  targetLongitude: number,
  startJD: number,
  endJD: number,
  options: OracleOptions = {}
): { roots: number[]; debug: OracleDebugInfo } {
  const toleranceDeg = options.toleranceDeg ?? 0.01;
  const maxStepDays = options.maxStepDays ?? 0.125; // 3h
  const dedupeEpsilonDays = options.dedupeEpsilonDays ?? minutesToDays(TOLERANCES.dedupeMinutes);
  const maxIterations = options.maxIterations ?? 80;

  if (!(startJD < endJD)) {
    throw new Error(`denseScanRootOracle expected startJD < endJD, got ${startJD} >= ${endJD}`);
  }

  const spanDays = endJD - startJD;
  const sampleCount = Math.max(16, Math.ceil(spanDays / maxStepDays));
  const stepDays = spanDays / sampleCount;

  const samples: Sample[] = [];
  const sanityWarnings: string[] = [];
  let prevPhi: number | null = null;
  for (let i = 0; i <= sampleCount; i++) {
    const jd = startJD + i * stepDays;
    const longitude = getLongitudeAtJd(jd);
    const rawPhase = longitude - targetLongitude;
    const phi = prevPhi == null ? rawPhase : unwrapNextPhi(prevPhi, rawPhase);
    const shortestDiff = signedShortestDiff(longitude, targetLongitude);

    // Coarse sanity guard against sampling pathologies in test harness.
    if (prevPhi != null && Math.abs(phi - prevPhi) > 40) {
      sanityWarnings.push(
        `Large phase jump at sample ${i} (Δphi=${(phi - prevPhi).toFixed(3)}° over ${stepDays.toFixed(6)}d)`
      );
    }

    samples.push({ jd, longitude, shortestDiff, phi });
    prevPhi = phi;
  }

  const roots: number[] = [];
  const crossings: OracleDebugInfo['crossings'] = [];

  // Endpoint near-zero roots only (avoid over-counting sampled interior points).
  const startSample = samples[0];
  const endSample = samples[samples.length - 1];
  if (Math.abs(startSample.shortestDiff) <= toleranceDeg * 2) {
    roots.push(startSample.jd);
  }
  if (Math.abs(endSample.shortestDiff) <= toleranceDeg * 2) {
    roots.push(endSample.jd);
  }

  // Enumerate all k*360 crossings in each sampled interval.
  for (let i = 0; i < samples.length - 1; i++) {
    const left = samples[i];
    const right = samples[i + 1];
    const ks = enumerateCrossingKs(left.phi, right.phi);
    if (ks.length === 0) continue;

    for (const k of ks) {
      const targetPhase = k * 360;
      crossings.push({ k, startJD: left.jd, endJD: right.jd });

      // If bracket endpoint is already exact, keep a single endpoint root.
      if (Math.abs(left.shortestDiff) <= toleranceDeg) {
        roots.push(left.jd);
        continue;
      }
      if (Math.abs(right.shortestDiff) <= toleranceDeg) {
        roots.push(right.jd);
        continue;
      }

      let bLeft = left;
      let bRight = right;
      let iterations = 0;
      let found = false;
      while (iterations < maxIterations && bRight.jd - bLeft.jd > dedupeEpsilonDays / 4) {
        const midJD = (bLeft.jd + bRight.jd) / 2;
        const midLongitude = getLongitudeAtJd(midJD);
        const midRawPhase = midLongitude - targetLongitude;
        const midPhi = unwrapNextPhi(bLeft.phi, midRawPhase);
        const midShortestDiff = signedShortestDiff(midLongitude, targetLongitude);

        if (Math.abs(midShortestDiff) <= toleranceDeg) {
          roots.push(midJD);
          found = true;
          break;
        }

        if ((bLeft.phi - targetPhase) * (midPhi - targetPhase) <= 0) {
          bRight = {
            jd: midJD,
            longitude: midLongitude,
            shortestDiff: midShortestDiff,
            phi: midPhi,
          };
        } else {
          bLeft = {
            jd: midJD,
            longitude: midLongitude,
            shortestDiff: midShortestDiff,
            phi: midPhi,
          };
        }
        iterations++;
      }

      if (!found) {
        roots.push((bLeft.jd + bRight.jd) / 2);
      }
    }
  }

  // Tangential fallback (no crossing required).
  for (let i = 1; i < samples.length - 1; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    const prevAbs = Math.abs(prev.shortestDiff);
    const currAbs = Math.abs(curr.shortestDiff);
    const nextAbs = Math.abs(next.shortestDiff);

    const isLocalMin =
      currAbs <= prevAbs && currAbs <= nextAbs && (currAbs < prevAbs || currAbs < nextAbs);
    if (!isLocalMin) continue;

    const hasPhaseCrossingHere = enumerateCrossingKs(prev.phi, next.phi).length > 0;
    if (hasPhaseCrossingHere) continue;

    if (currAbs > toleranceDeg * 20) continue;

    let leftJD = prev.jd;
    let rightJD = next.jd;
    let iterations = 0;
    while (iterations < maxIterations && rightJD - leftJD > dedupeEpsilonDays / 4) {
      const m1 = leftJD + (rightJD - leftJD) / 3;
      const m2 = rightJD - (rightJD - leftJD) / 3;
      const d1 = Math.abs(signedShortestDiff(getLongitudeAtJd(m1), targetLongitude));
      const d2 = Math.abs(signedShortestDiff(getLongitudeAtJd(m2), targetLongitude));
      if (d1 <= d2) {
        rightJD = m2;
      } else {
        leftJD = m1;
      }
      iterations++;
    }

    const candidateJD = (leftJD + rightJD) / 2;
    const candidateAbs = Math.abs(
      signedShortestDiff(getLongitudeAtJd(candidateJD), targetLongitude)
    );
    if (candidateAbs <= toleranceDeg * 2) {
      roots.push(candidateJD);
    }
  }

  roots.sort((a, b) => a - b);
  const dedupedRoots = dedupeSortedRoots(roots, dedupeEpsilonDays);

  const debug: OracleDebugInfo = {
    toleranceDeg,
    sampleStepDays: stepDays,
    dedupeEpsilonDays,
    sanityWarnings,
    crossings,
    samples: samples.map((s) => ({
      jd: s.jd,
      isoUtc: options.toIsoUtc ? options.toIsoUtc(s.jd) : undefined,
      longitude: s.longitude,
      shortestDiff: s.shortestDiff,
      phi: s.phi,
    })),
  };

  return { roots: dedupedRoots, debug };
}
