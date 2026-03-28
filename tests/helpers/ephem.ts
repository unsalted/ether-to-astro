import { EphemerisCalculator } from '../../src/ephemeris.js';

let sharedEphem: EphemerisCalculator | null = null;

export async function getSharedEphemeris(): Promise<EphemerisCalculator> {
  if (!sharedEphem) {
    sharedEphem = new EphemerisCalculator();
    await sharedEphem.init();
  }
  return sharedEphem;
}
