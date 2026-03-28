#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { Command, Option } from 'commander';
import pc from 'picocolors';
import {
  ProfileStoreError,
  loadResolvedProfileFile,
  resolveProfileSelection,
  toNatalInput,
} from './profile-store.js';
import { getToolSpec, type ToolExecutionResult } from './tool-registry.js';
import type { AstroService as AstroServiceType, SetNatalChartInput } from './astro-service.js';
import type { HouseSystem, NatalChart } from './types.js';

interface CliIO {
  stdout: (msg: string) => void;
  stderr: (msg: string) => void;
}

interface SharedOptions {
  pretty?: boolean;
  profile?: string;
  profileFile?: string;
  natalFile?: string;
  name?: string;
  year?: string;
  month?: string;
  day?: string;
  hour?: string;
  minute?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  houseSystem?: string;
  birthTimeDisambiguation?: 'compatible' | 'earlier' | 'later' | 'reject';
}

interface TransitOptions extends SharedOptions {
  date?: string;
  categories?: string;
  includeMundane?: boolean;
  daysAhead?: string;
  maxOrb?: string;
  exactOnly?: boolean;
  applyingOnly?: boolean;
}

interface HousesOptions extends SharedOptions {
  system?: string;
}

interface ChartOptions extends SharedOptions {
  date?: string;
  theme?: 'light' | 'dark';
  format?: 'svg' | 'png' | 'webp';
  outputPath?: string;
}

interface NonNatalTimezoneOptions extends SharedOptions {
  timezone?: string;
}

interface SchemaProperty {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  default?: unknown;
}

interface ToolInputSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
}

function mustTool(name: string) {
  const spec = getToolSpec(name);
  if (!spec) {
    throw new Error(`Missing tool specification: ${name}`);
  }
  return spec;
}

function toolSchemaProperty(toolName: string, propertyName: string): SchemaProperty {
  const schema = mustTool(toolName).inputSchema as ToolInputSchema;
  const prop = schema.properties?.[propertyName];
  if (!prop) {
    throw new Error(`Missing schema property: ${toolName}.${propertyName}`);
  }
  return prop;
}

function toFlag(propertyName: string): string {
  return propertyName.replaceAll('_', '-');
}

function addSchemaOption(
  command: Command,
  toolName: string,
  propertyName: string,
  override?: { valueHint?: string; choices?: string[] }
): Command {
  const prop = toolSchemaProperty(toolName, propertyName);
  const flag = toFlag(propertyName);
  const description = prop.description ?? propertyName;
  const choices = override?.choices ?? prop.enum;

  if (prop.type === 'boolean') {
    command.option(`--${flag}`, description);
    return command;
  }

  const valueHint = override?.valueHint ?? 'value';
  if (choices && choices.length > 0) {
    command.addOption(new Option(`--${flag} <${valueHint}>`, description).choices(choices));
    return command;
  }
  command.option(`--${flag} <${valueHint}>`, description);
  return command;
}

function toNumber(raw: string | undefined, field: string): number {
  if (raw == null) {
    throw new Error(`Missing required argument --${field}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${field}: ${raw}`);
  }
  return parsed;
}

async function loadNatalFromFile(path: string): Promise<SetNatalChartInput> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as Partial<SetNatalChartInput>;
  return {
    name: parsed.name ?? 'CLI User',
    year: Number(parsed.year),
    month: Number(parsed.month),
    day: Number(parsed.day),
    hour: Number(parsed.hour),
    minute: Number(parsed.minute),
    latitude: Number(parsed.latitude),
    longitude: Number(parsed.longitude),
    timezone: String(parsed.timezone),
    house_system: parsed.house_system,
    birth_time_disambiguation: parsed.birth_time_disambiguation,
  };
}

async function resolveNatalInput(options: SharedOptions): Promise<SetNatalChartInput> {
  if (options.natalFile) {
    return loadNatalFromFile(options.natalFile);
  }

  return {
    name: options.name ?? 'CLI User',
    year: toNumber(options.year, 'year'),
    month: toNumber(options.month, 'month'),
    day: toNumber(options.day, 'day'),
    hour: toNumber(options.hour, 'hour'),
    minute: toNumber(options.minute, 'minute'),
    latitude: toNumber(options.latitude, 'latitude'),
    longitude: toNumber(options.longitude, 'longitude'),
    timezone: options.timezone ?? (() => {
      throw new Error('Missing required argument --timezone');
    })(),
    house_system: options.houseSystem as HouseSystem | undefined,
    birth_time_disambiguation: options.birthTimeDisambiguation,
  };
}

function hasInlineNatalInput(options: SharedOptions): boolean {
  return (
    options.year !== undefined
    || options.month !== undefined
    || options.day !== undefined
    || options.hour !== undefined
    || options.minute !== undefined
    || options.latitude !== undefined
    || options.longitude !== undefined
    || options.timezone !== undefined
  );
}

function withProfileOptions(command: Command): Command {
  return command
    .option('--profile <name>', 'Profile name to load from profile file')
    .option('--profile-file <path>', 'Explicit path to profile file');
}

function emit(io: CliIO, data: unknown, text: string, pretty: boolean): void {
  if (pretty) {
    io.stdout(`${pc.bold(pc.cyan('e2a'))}\n${text}`);
    return;
  }
  io.stdout(JSON.stringify(data, null, 2));
}

function emitExecution(io: CliIO, result: ToolExecutionResult, pretty: boolean): void {
  if (result.kind === 'state') {
    emit(io, result.data, result.text, pretty);
    return;
  }
  const text = result.content
    .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
  emit(io, { content: result.content }, text, pretty);
}

function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof ProfileStoreError) {
    return { code: error.code, message: error.message };
  }
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const code = (error as { code: unknown }).code;
    const message = (error as { message: unknown }).message;
    if (typeof code === 'string' && typeof message === 'string') {
      return { code, message };
    }
  }
  if (error instanceof Error) {
    return { code: 'CLI_ERROR', message: error.message };
  }
  return { code: 'CLI_ERROR', message: String(error) };
}

function commonNatalOptions(command: Command): Command {
  withProfileOptions(command);
  command.option('--natal-file <path>', 'JSON file containing natal inputs');
  addSchemaOption(command, 'set_natal_chart', 'name', { valueHint: 'name' });
  addSchemaOption(command, 'set_natal_chart', 'year', { valueHint: 'number' });
  addSchemaOption(command, 'set_natal_chart', 'month', { valueHint: 'number' });
  addSchemaOption(command, 'set_natal_chart', 'day', { valueHint: 'number' });
  addSchemaOption(command, 'set_natal_chart', 'hour', { valueHint: 'number' });
  addSchemaOption(command, 'set_natal_chart', 'minute', { valueHint: 'number' });
  addSchemaOption(command, 'set_natal_chart', 'latitude', { valueHint: 'number' });
  addSchemaOption(command, 'set_natal_chart', 'longitude', { valueHint: 'number' });
  addSchemaOption(command, 'set_natal_chart', 'timezone', { valueHint: 'tz' });
  addSchemaOption(command, 'set_natal_chart', 'house_system', { valueHint: 'system' });
  addSchemaOption(command, 'set_natal_chart', 'birth_time_disambiguation', { valueHint: 'mode' });
  command.option('--pretty', 'Human-readable output instead of JSON');
  return command;
}

async function withNatalChart(
  service: AstroServiceType,
  options: SharedOptions,
  fn: (natalChart: NatalChart, pretty: boolean) => Promise<void>
): Promise<void> {
  let natalInput: SetNatalChartInput | null = null;
  if (options.natalFile || hasInlineNatalInput(options)) {
    natalInput = await resolveNatalInput(options);
  } else {
    const profileSelection = await resolveProfileSelection({
      profileName: options.profile,
      profileFile: options.profileFile,
    });
    natalInput = profileSelection ? toNatalInput(profileSelection.profile) : null;
  }

  if (!natalInput) {
    throw new ProfileStoreError(
      'PROFILE_NOT_FOUND',
      'No natal context resolved. Provide natal fields, --natal-file, or --profile.'
    );
  }

  const setNatal = mustTool('set_natal_chart');
  const result = await setNatal.execute(
    { service, natalChart: null },
    natalInput as unknown as Record<string, unknown>
  );
  if (result.kind !== 'state' || !result.natalChart) {
    throw new Error('set_natal_chart did not return a natal chart');
  }
  await fn(result.natalChart, options.pretty ?? false);
}

async function resolveCommandTimezone(options: SharedOptions): Promise<string> {
  if (options.timezone) {
    return options.timezone;
  }
  const explicitProfileRequested = Boolean(
    options.profile
      || options.profileFile
      || process.env.ASTRO_PROFILE
      || process.env.ASTRO_PROFILE_FILE
  );
  try {
    const profileSelection = await resolveProfileSelection({
      profileName: options.profile,
      profileFile: options.profileFile,
    });
    return profileSelection?.profile.timezone ?? 'UTC';
  } catch (error) {
    if (error instanceof ProfileStoreError && !explicitProfileRequested) {
      return 'UTC';
    }
    throw error;
  }
}

function emitCliError(io: CliIO, pretty: boolean, err: unknown): number {
  const payload = errorPayload(err);
  if (pretty) {
    io.stderr(pc.red(payload.message));
  } else {
    io.stderr(JSON.stringify(payload, null, 2));
  }
  return 1;
}

export async function runCli(
  argv: string[],
  io: CliIO = {
    stdout: (msg) => console.log(msg),
    stderr: (msg) => console.error(msg),
  }
): Promise<number> {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const { AstroService } = await import('./astro-service.js');
  const service: AstroServiceType = new AstroService();
  await service.init();

  const program = new Command();

  program
    .name('e2a')
    .description('Single-shot astrology CLI (JSON-first, stateless)')
    .showHelpAfterError('(add --help for more details)')
    .configureOutput({
      writeErr: (str) => io.stderr(str.trimEnd()),
      writeOut: (str) => io.stdout(str.trimEnd()),
    });

  commonNatalOptions(program.command('set-natal-chart').description(mustTool('set_natal_chart').description))
    .action(async (options: SharedOptions) => {
      const setNatal = mustTool('set_natal_chart');
      const profileSelection = options.natalFile || hasInlineNatalInput(options)
        ? null
        : await resolveProfileSelection({
            profileName: options.profile,
            profileFile: options.profileFile,
          });
      const natalInput = options.natalFile || hasInlineNatalInput(options)
        ? await resolveNatalInput(options)
        : profileSelection
          ? toNatalInput(profileSelection.profile)
          : (() => {
              throw new ProfileStoreError(
                'PROFILE_NOT_FOUND',
                'No natal context resolved. Provide natal fields, --natal-file, or --profile.'
              );
            })();
      const result = await setNatal.execute(
        { service, natalChart: null },
        natalInput as unknown as Record<string, unknown>
      );
      emitExecution(io, result, options.pretty ?? false);
    });

  program
    .command('get-retrograde-planets')
    .description(mustTool('get_retrograde_planets').description)
    .option('--timezone <tz>', 'Timezone label for output')
    .option('--profile <name>', 'Profile name to load from profile file')
    .option('--profile-file <path>', 'Explicit path to profile file')
    .option('--pretty', 'Human-readable output instead of JSON')
    .action(async (options: NonNatalTimezoneOptions) => {
      const spec = mustTool('get_retrograde_planets');
      const timezone = await resolveCommandTimezone(options);
      const result = await spec.execute({ service, natalChart: null }, { timezone });
      emitExecution(io, result, options.pretty ?? false);
    });

  program
    .command('get-asteroid-positions')
    .description(mustTool('get_asteroid_positions').description)
    .option('--timezone <tz>', 'Timezone label for output')
    .option('--profile <name>', 'Profile name to load from profile file')
    .option('--profile-file <path>', 'Explicit path to profile file')
    .option('--pretty', 'Human-readable output instead of JSON')
    .action(async (options: NonNatalTimezoneOptions) => {
      const spec = mustTool('get_asteroid_positions');
      const timezone = await resolveCommandTimezone(options);
      const result = await spec.execute({ service, natalChart: null }, { timezone });
      emitExecution(io, result, options.pretty ?? false);
    });

  program
    .command('get-next-eclipses')
    .description(mustTool('get_next_eclipses').description)
    .option('--timezone <tz>', 'Timezone label for output')
    .option('--profile <name>', 'Profile name to load from profile file')
    .option('--profile-file <path>', 'Explicit path to profile file')
    .option('--pretty', 'Human-readable output instead of JSON')
    .action(async (options: NonNatalTimezoneOptions) => {
      const spec = mustTool('get_next_eclipses');
      const timezone = await resolveCommandTimezone(options);
      const result = await spec.execute({ service, natalChart: null }, { timezone });
      emitExecution(io, result, options.pretty ?? false);
    });

  const profiles = program.command('profiles').description('Inspect and validate CLI profile files');

  profiles.command('list').description('List available profiles')
    .option('--profile-file <path>', 'Explicit path to profile file')
    .option('--pretty', 'Human-readable output instead of JSON')
    .action(async (options: SharedOptions) => {
      const { filePath, file } = await loadResolvedProfileFile({
        profileFile: options.profileFile,
      });
      const names = Object.keys(file.profiles).sort();
      const data = {
        filePath,
        defaultProfile: file.defaultProfile ?? null,
        profiles: names,
      };
      const text = names.length === 0
        ? `No profiles found in ${filePath}`
        : `Profiles in ${filePath}:\n- ${names.join('\n- ')}`;
      emit(io, data, text, options.pretty ?? false);
    });

  profiles.command('show').description('Show a profile')
    .requiredOption('--profile <name>', 'Profile name to show')
    .option('--profile-file <path>', 'Explicit path to profile file')
    .option('--pretty', 'Human-readable output instead of JSON')
    .action(async (options: SharedOptions) => {
      const { filePath, file } = await loadResolvedProfileFile({
        profileFile: options.profileFile,
      });
      const profileName = options.profile as string;
      const profile = file.profiles[profileName];
      if (!profile) {
        throw new ProfileStoreError(
          'PROFILE_NOT_FOUND',
          `Profile "${profileName}" not found in ${filePath}`
        );
      }
      const data = {
        filePath,
        profileName,
        profile,
      };
      const text = `Profile "${profileName}" from ${filePath}`;
      emit(io, data, text, options.pretty ?? false);
    });

  profiles.command('validate').description('Validate profile file schema')
    .option('--profile-file <path>', 'Explicit path to profile file')
    .option('--pretty', 'Human-readable output instead of JSON')
    .action(async (options: SharedOptions) => {
      const { filePath, file } = await loadResolvedProfileFile({
        profileFile: options.profileFile,
      });
      const data = {
        valid: true,
        filePath,
        profileCount: Object.keys(file.profiles).length,
        defaultProfile: file.defaultProfile ?? null,
      };
      const text = `Profile file is valid: ${filePath}`;
      emit(io, data, text, options.pretty ?? false);
    });

  commonNatalOptions(program.command('get-transits').description(mustTool('get_transits').description))
    .option('--date <yyyy-mm-dd>', toolSchemaProperty('get_transits', 'date').description ?? 'Date for transits')
    .option('--categories <list>', toolSchemaProperty('get_transits', 'categories').description ?? 'Categories')
    .option(
      '--include-mundane',
      toolSchemaProperty('get_transits', 'include_mundane').description ?? 'Include mundane positions'
    )
    .option(
      '--days-ahead <number>',
      toolSchemaProperty('get_transits', 'days_ahead').description ?? 'Days ahead'
    )
    .option('--max-orb <number>', toolSchemaProperty('get_transits', 'max_orb').description ?? 'Max orb')
    .option('--exact-only', toolSchemaProperty('get_transits', 'exact_only').description ?? 'Exact only')
    .option(
      '--applying-only',
      toolSchemaProperty('get_transits', 'applying_only').description ?? 'Applying only'
    )
    .action(async (options: TransitOptions) => {
      await withNatalChart(service, options, async (chart, pretty) => {
        const categories = options.categories?.split(',').map((v) => v.trim()).filter(Boolean);
        const input = {
          date: options.date,
          categories,
          include_mundane: options.includeMundane,
          days_ahead: options.daysAhead == null ? undefined : toNumber(options.daysAhead, 'days-ahead'),
          max_orb: options.maxOrb == null ? undefined : toNumber(options.maxOrb, 'max-orb'),
          exact_only: options.exactOnly,
          applying_only: options.applyingOnly,
        };
        const spec = mustTool('get_transits');
        const result = await spec.execute({ service, natalChart: chart }, input as Record<string, unknown>);
        emitExecution(io, result, pretty);
      });
    });

  commonNatalOptions(program.command('get-houses').description(mustTool('get_houses').description))
    .addOption(
      new Option(
        '--system <system>',
        toolSchemaProperty('get_houses', 'system').description ?? 'House system override'
      ).choices(['P', 'W', 'K', 'E'])
    )
    .action(async (options: HousesOptions) => {
      await withNatalChart(service, options, async (chart, pretty) => {
        const spec = mustTool('get_houses');
        const result = await spec.execute(
          { service, natalChart: chart },
          { system: options.system ?? options.houseSystem }
        );
        emitExecution(io, result, pretty);
      });
    });

  commonNatalOptions(program.command('get-rise-set-times').description(mustTool('get_rise_set_times').description))
    .action(async (options: SharedOptions) => {
      await withNatalChart(service, options, async (chart, pretty) => {
        const spec = mustTool('get_rise_set_times');
        const result = await spec.execute({ service, natalChart: chart }, {});
        emitExecution(io, result, pretty);
      });
    });

  commonNatalOptions(program.command('generate-natal-chart').description(mustTool('generate_natal_chart').description))
    .addOption(
      new Option(
        '--theme <theme>',
        toolSchemaProperty('generate_natal_chart', 'theme').description ?? 'Chart theme'
      ).choices(['light', 'dark'])
    )
    .addOption(
      new Option(
        '--format <format>',
        toolSchemaProperty('generate_natal_chart', 'format').description ?? 'Output format'
      ).choices(['svg', 'png', 'webp']).default('svg')
    )
    .option(
      '--output-path <path>',
      toolSchemaProperty('generate_natal_chart', 'output_path').description ?? 'Output path'
    )
    .action(async (options: ChartOptions) => {
      await withNatalChart(service, options, async (chart, pretty) => {
        const spec = mustTool('generate_natal_chart');
        const result = await spec.execute({ service, natalChart: chart }, {
          theme: options.theme,
          format: options.format,
          output_path: options.outputPath,
        });
        emitExecution(io, result, pretty);
      });
    });

  commonNatalOptions(program.command('generate-transit-chart').description(mustTool('generate_transit_chart').description))
    .option(
      '--date <yyyy-mm-dd>',
      toolSchemaProperty('generate_transit_chart', 'date').description ?? 'Transit date'
    )
    .addOption(
      new Option(
        '--theme <theme>',
        toolSchemaProperty('generate_transit_chart', 'theme').description ?? 'Chart theme'
      ).choices(['light', 'dark'])
    )
    .addOption(
      new Option(
        '--format <format>',
        toolSchemaProperty('generate_transit_chart', 'format').description ?? 'Output format'
      ).choices(['svg', 'png', 'webp']).default('svg')
    )
    .option(
      '--output-path <path>',
      toolSchemaProperty('generate_transit_chart', 'output_path').description ?? 'Output path'
    )
    .action(async (options: ChartOptions) => {
      await withNatalChart(service, options, async (chart, pretty) => {
        const spec = mustTool('generate_transit_chart');
        const result = await spec.execute({ service, natalChart: chart }, {
          date: options.date,
          theme: options.theme,
          format: options.format,
          output_path: options.outputPath,
        });
        emitExecution(io, result, pretty);
      });
    });

  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (err) {
    return emitCliError(io, argv.includes('--pretty'), err);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
