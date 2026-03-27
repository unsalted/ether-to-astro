import { TOLERANCES, minutesToDays } from './tolerances.js';

interface Sample {
  jd: number;
  diff: number;
}

interface OracleOptions {
  toleranceDeg?: number;
  maxStepDays?: number;
  dedupeEpsilonDays?: number;
  maxIterations?: number;
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

export function denseScanRootOracle(
  getLongitudeAtJd: (jd: number) => number,
  targetLongitude: number,
  startJD: number,
  endJD: number,
  options: OracleOptions = {}
): number[] {
  const toleranceDeg = options.toleranceDeg ?? 0.01;
  const maxStepDays = options.maxStepDays ?? 0.125; // 3h
  const dedupeEpsilonDays = options.dedupeEpsilonDays ?? minutesToDays(TOLERANCES.dedupeMinutes);
  const maxIterations = options.maxIterations ?? 80;

  if (!(startJD < endJD)) {
    throw new Error(`denseScanRootOracle expected startJD < endJD, got ${startJD} >= ${endJD}`);
  }

  const spanDays = endJD - startJD;
  const sampleCount = Math.max(16, Math.ceil(spanDays / maxStepDays));
  const step = spanDays / sampleCount;

  const samples: Sample[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const jd = startJD + i * step;
    samples.push({ jd, diff: signedShortestDiff(getLongitudeAtJd(jd), targetLongitude) });
  }

  const roots: number[] = [];

  // Endpoint and near-zero sampled roots.
  for (const s of samples) {
    if (Math.abs(s.diff) <= toleranceDeg * 2) {
      roots.push(s.jd);
    }
  }

  // Sign-change intervals => bisection refinement.
  for (let i = 0; i < samples.length - 1; i++) {
    let left = samples[i];
    let right = samples[i + 1];

    if (left.diff === 0) {
      roots.push(left.jd);
      continue;
    }
    if (right.diff === 0) {
      roots.push(right.jd);
      continue;
    }

    const hasSignChange = (left.diff > 0 && right.diff < 0) || (left.diff < 0 && right.diff > 0);
    if (!hasSignChange) {
      continue;
    }

    let iterations = 0;
    while (iterations < maxIterations && (right.jd - left.jd) > dedupeEpsilonDays / 4) {
      const midJD = (left.jd + right.jd) / 2;
      const midDiff = signedShortestDiff(getLongitudeAtJd(midJD), targetLongitude);
      if (Math.abs(midDiff) <= toleranceDeg) {
        roots.push(midJD);
        break;
      }
      if ((left.diff > 0 && midDiff > 0) || (left.diff < 0 && midDiff < 0)) {
        left = { jd: midJD, diff: midDiff };
      } else {
        right = { jd: midJD, diff: midDiff };
      }
      iterations++;
    }

    roots.push((left.jd + right.jd) / 2);
  }

  // Local minima in |diff| catch tangential roots without sign changes.
  for (let i = 1; i < samples.length - 1; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    const prevAbs = Math.abs(prev.diff);
    const currAbs = Math.abs(curr.diff);
    const nextAbs = Math.abs(next.diff);

    const isLocalMin = currAbs <= prevAbs && currAbs <= nextAbs && (currAbs < prevAbs || currAbs < nextAbs);
    if (!isLocalMin) {
      continue;
    }

    // Ternary refinement on |diff| in a small interval around local minimum.
    let leftJD = prev.jd;
    let rightJD = next.jd;
    let iterations = 0;
    while (iterations < maxIterations && (rightJD - leftJD) > dedupeEpsilonDays / 4) {
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
    const candidateAbs = Math.abs(signedShortestDiff(getLongitudeAtJd(candidateJD), targetLongitude));
    if (candidateAbs <= toleranceDeg * 2) {
      roots.push(candidateJD);
    }
  }

  roots.sort((a, b) => a - b);
  return dedupeSortedRoots(roots, dedupeEpsilonDays);
}
