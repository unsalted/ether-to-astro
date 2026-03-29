import type { ChartRenderer } from '../charts.js';
import { getDefaultTheme } from '../constants.js';
import { formatDateOnly } from '../formatter.js';
import { localToUTC, utcToLocal } from '../time-utils.js';
import type { NatalChart } from '../types.js';
import { parseDateOnlyInput } from './date-input.js';

interface GenerateChartInput {
  theme?: 'light' | 'dark';
  format?: 'svg' | 'png' | 'webp';
  output_path?: string;
}

interface GenerateTransitChartInput extends GenerateChartInput {
  date?: string;
}

interface ChartServiceResult {
  format: 'svg' | 'png' | 'webp';
  outputPath?: string;
  text: string;
  svg?: string;
  image?: {
    data: string;
    mimeType: string;
  };
}

interface ChartOutputServiceDependencies {
  chartRenderer: ChartRenderer;
  now: () => Date;
  writeFile: (path: string, data: string | Buffer, encoding?: BufferEncoding) => Promise<void>;
}

/**
 * Internal chart rendering/output workflow used by `AstroService`.
 *
 * @remarks
 * This module owns theme defaults, target-date resolution, and inline-vs-file
 * output serialization for natal and transit chart rendering.
 */
export class ChartOutputService {
  private readonly chartRenderer: ChartRenderer;
  private readonly now: () => Date;
  private readonly writeFile: (
    path: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ) => Promise<void>;

  constructor(deps: ChartOutputServiceDependencies) {
    this.chartRenderer = deps.chartRenderer;
    this.now = deps.now;
    this.writeFile = deps.writeFile;
  }

  /**
   * Generate a natal chart image or SVG for the current chart.
   */
  async generateNatalChart(
    natalChart: NatalChart,
    input: GenerateChartInput = {}
  ): Promise<ChartServiceResult> {
    const theme = input.theme || getDefaultTheme(natalChart.location.timezone);
    const format = input.format || 'svg';
    const outputPath = input.output_path;
    const chart = await this.chartRenderer.generateNatalChart(natalChart, theme, format);

    if (outputPath) {
      if (format === 'svg') {
        await this.writeFile(outputPath, chart as string, 'utf-8');
      } else {
        await this.writeFile(outputPath, chart as Buffer);
      }
      return {
        format,
        outputPath,
        text: `Natal Chart for ${natalChart.name} saved to: ${outputPath}`,
      };
    }

    if (format === 'svg') {
      return {
        format,
        text: `Natal Chart for ${natalChart.name}:`,
        svg: chart as string,
      };
    }

    return {
      format,
      text: `Natal Chart for ${natalChart.name} (${theme} theme, ${format.toUpperCase()} format):`,
      image: {
        data: (chart as Buffer).toString('base64'),
        mimeType: format === 'png' ? 'image/png' : 'image/webp',
      },
    };
  }

  /**
   * Generate a transit chart image or SVG for a target date.
   */
  async generateTransitChart(
    natalChart: NatalChart,
    input: GenerateTransitChartInput = {}
  ): Promise<ChartServiceResult> {
    const theme = input.theme ?? getDefaultTheme(natalChart.location.timezone);
    const format = input.format ?? 'svg';
    const targetDate = this.resolveTransitTargetDate(natalChart, input.date);
    const outputPath = input.output_path;
    const chart = await this.chartRenderer.generateTransitChart(
      natalChart,
      targetDate,
      theme,
      format
    );
    const dateLabel = formatDateOnly(targetDate, natalChart.location.timezone);

    if (outputPath) {
      if (format === 'svg') {
        await this.writeFile(outputPath, chart as string, 'utf-8');
      } else {
        await this.writeFile(outputPath, chart as Buffer);
      }
      return {
        format,
        outputPath,
        text: `Transit Chart for ${natalChart.name} (${dateLabel}) saved to ${outputPath}`,
      };
    }

    if (format === 'svg') {
      return {
        format,
        text: `Transit Chart for ${natalChart.name} (${dateLabel})`,
        svg: chart as string,
      };
    }

    return {
      format,
      text: `Transit Chart for ${natalChart.name} (${dateLabel}, ${theme} theme, ${format.toUpperCase()} format):`,
      image: {
        data: (chart as Buffer).toString('base64'),
        mimeType: format === 'png' ? 'image/png' : 'image/webp',
      },
    };
  }

  /**
   * Resolve the local-noon transit anchor when the caller omits a date.
   */
  private resolveTransitTargetDate(natalChart: NatalChart, dateStr?: string): Date {
    if (dateStr) {
      const parsed = parseDateOnlyInput(dateStr);
      return localToUTC(parsed, natalChart.location.timezone);
    }

    const now = this.now();
    const localNow = utcToLocal(now, natalChart.location.timezone);
    const localNoon = { ...localNow, hour: 12, minute: 0, second: 0 };
    return localToUTC(localNoon, natalChart.location.timezone);
  }
}
