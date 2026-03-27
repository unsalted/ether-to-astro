import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { NatalChart, PlanetPosition, PLANETS, PLANET_NAMES } from './types.js';
import { EphemerisCalculator } from './ephemeris.js';

// Get project root (dist/ -> project/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const STORAGE_PATH = process.env.NATAL_CHART_PATH || join(projectRoot, 'natal-chart.json');

export class ChartStorage {
  private ephem: EphemerisCalculator;

  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  async saveNatalChart(chart: NatalChart): Promise<void> {
    const chartWithPlanets = await this.calculateNatalPlanets(chart);
    await writeFile(STORAGE_PATH, JSON.stringify(chartWithPlanets, null, 2));
  }

  async loadNatalChart(): Promise<NatalChart | null> {
    if (!existsSync(STORAGE_PATH)) {
      return null;
    }
    const data = await readFile(STORAGE_PATH, 'utf-8');
    return JSON.parse(data);
  }

  private async calculateNatalPlanets(chart: NatalChart): Promise<NatalChart> {
    const { year, month, day, hour, minute, second = 0 } = chart.birthDate;
    const birthDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const jd = this.ephem.dateToJulianDay(birthDate);
    
    const planetIds = Object.values(PLANETS);
    const planets = this.ephem.getAllPlanets(jd, planetIds);
    
    return {
      ...chart,
      planets
    };
  }

  async hasNatalChart(): Promise<boolean> {
    return existsSync(STORAGE_PATH);
  }
}
