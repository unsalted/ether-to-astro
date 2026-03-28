import { describe, expect, it, vi } from 'vitest';
import { createToolSpecIndex, getToolSpec, MCP_TOOL_SPECS } from '../../src/tool-registry.js';

function makeService() {
  return {
    setNatalChart: vi.fn(() => ({ data: { ok: true }, text: 'set', chart: { name: 'x' } })),
    getRisingSignWindows: vi.fn(() => ({ data: { windows: [] }, text: 'rising windows' })),
    getTransits: vi.fn(() => ({ data: { transits: [] }, text: 'transits' })),
    getHouses: vi.fn(() => ({ data: { system: 'P' }, text: 'houses' })),
    resolveReportingTimezone: vi.fn((explicit?: string, natal?: string) => {
      return explicit ?? 'America/New_York' ?? natal ?? 'UTC';
    }),
    getRetrogradePlanets: vi.fn(() => ({ data: { planets: [] }, text: 'retro' })),
    getRiseSetTimes: vi.fn(async () => ({ data: { times: [] }, text: 'rise' })),
    getAsteroidPositions: vi.fn(() => ({ data: { positions: [] }, text: 'asteroids' })),
    getNextEclipses: vi.fn(() => ({ data: { eclipses: [] }, text: 'eclipses' })),
    getServerStatus: vi.fn(() => ({ data: { ok: true }, text: 'status' })),
    generateNatalChart: vi.fn(async () => ({ format: 'svg', text: 'natal', svg: '<svg />' })),
    generateTransitChart: vi.fn(async () => ({ format: 'png', text: 'transit', image: { data: 'abc', mimeType: 'image/png' } })),
  };
}

describe('When resolving tool specs from the registry', () => {
  it('Given the registry map, then specs are indexed and retrievable by name', () => {
    const index = createToolSpecIndex();
    expect(index.size).toBe(MCP_TOOL_SPECS.length);
    expect(getToolSpec('set_natal_chart')?.name).toBe('set_natal_chart');
  });

  it('Given set_natal_chart execution, then state result includes natal chart', async () => {
    const spec = getToolSpec('set_natal_chart');
    expect(spec).toBeDefined();
    const service = makeService();
    const result = await spec!.execute(
      { service: service as any, natalChart: null },
      {
        name: 'A',
        year: 2000,
        month: 1,
        day: 1,
        hour: 1,
        minute: 1,
        latitude: 1,
        longitude: 1,
        timezone: 'UTC',
      }
    );
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.natalChart).toBeDefined();
    }
  });

  it('Given simple state tools, then calls route to matching service methods', async () => {
    const service = makeService();
    const ctx = { service: service as any, natalChart: { name: 'chart' } as any };
    const retro = await getToolSpec('get_retrograde_planets')!.execute(ctx, { timezone: 'UTC' });
    const status = await getToolSpec('get_server_status')!.execute(ctx, {});
    expect(retro.kind).toBe('state');
    expect(status.kind).toBe('state');
    expect(service.getRetrogradePlanets).toHaveBeenCalledWith('UTC');
    expect(service.getServerStatus).toHaveBeenCalled();
  });

  it('Given rising-sign window arguments, then tool routes to the shared service with deterministic shape', async () => {
    const service = makeService();
    const result = await getToolSpec('get_rising_sign_windows')!.execute(
      { service: service as any, natalChart: null },
      {
        date: '2026-03-28',
        latitude: 40.7128,
        longitude: -74.006,
        timezone: 'America/New_York',
        mode: 'exact',
      }
    );

    expect(result.kind).toBe('state');
    expect(service.getRisingSignWindows).toHaveBeenCalledWith({
      date: '2026-03-28',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
      mode: 'exact',
    });
  });

  it('Given async state tool handlers, then they resolve to state payloads', async () => {
    const service = makeService();
    const ctx = { service: service as any, natalChart: { name: 'chart' } as any };
    const rise = await getToolSpec('get_rise_set_times')!.execute(ctx, {});
    const ast = await getToolSpec('get_asteroid_positions')!.execute(ctx, { timezone: 'UTC' });
    const eclipse = await getToolSpec('get_next_eclipses')!.execute(ctx, { timezone: 'UTC' });
    expect(rise.kind).toBe('state');
    expect(ast.kind).toBe('state');
    expect(eclipse.kind).toBe('state');
  });

  it('Given natal chart SVG output, then content includes text plus SVG', async () => {
    const service = makeService();
    const result = await getToolSpec('generate_natal_chart')!.execute(
      { service: service as any, natalChart: { name: 'chart' } as any },
      {}
    );
    expect(result.kind).toBe('content');
    if (result.kind === 'content') {
      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toMatchObject({ type: 'text' });
    }
  });

  it('Given transit chart output_path, then content includes text-only save confirmation', async () => {
    const service = makeService();
    service.generateTransitChart.mockResolvedValue({
      format: 'png',
      text: 'saved',
      outputPath: '/tmp/out.png',
    });

    const result = await getToolSpec('generate_transit_chart')!.execute(
      { service: service as any, natalChart: { name: 'chart' } as any },
      {}
    );

    expect(result.kind).toBe('content');
    if (result.kind === 'content') {
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({ type: 'text', text: 'saved' });
    }
  });

  it('Given transit chart binary image output, then content includes image payload', async () => {
    const service = makeService();
    service.generateTransitChart.mockResolvedValue({
      format: 'png',
      text: 'transit',
      image: { data: 'xyz', mimeType: 'image/png' },
    });
    const result = await getToolSpec('generate_transit_chart')!.execute(
      { service: service as any, natalChart: { name: 'chart' } as any },
      {}
    );
    expect(result.kind).toBe('content');
    if (result.kind === 'content') {
      expect(result.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    }
  });

  it('Given natal output_path and transit SVG output, then each branch returns the expected content shape', async () => {
    const service = makeService();
    service.generateNatalChart.mockResolvedValue({
      format: 'png',
      text: 'saved natal',
      outputPath: '/tmp/natal.png',
    });
    service.generateTransitChart.mockResolvedValue({
      format: 'svg',
      text: 'transit svg',
      svg: '<svg />',
    });

    const natal = await getToolSpec('generate_natal_chart')!.execute(
      { service: service as any, natalChart: { name: 'chart' } as any },
      {}
    );
    const transit = await getToolSpec('generate_transit_chart')!.execute(
      { service: service as any, natalChart: { name: 'chart' } as any },
      {}
    );
    expect(natal.kind).toBe('content');
    expect(transit.kind).toBe('content');
    if (natal.kind === 'content') {
      expect(natal.content).toHaveLength(1);
    }
    if (transit.kind === 'content') {
      expect(transit.content).toHaveLength(2);
    }
  });

  it('Given natal chart binary image output, then content includes image payload', async () => {
    const service = makeService();
    service.generateNatalChart.mockResolvedValue({
      format: 'webp',
      text: 'natal image',
      image: { data: 'img', mimeType: 'image/webp' },
    });
    const result = await getToolSpec('generate_natal_chart')!.execute(
      { service: service as any, natalChart: { name: 'chart' } as any },
      {}
    );
    expect(result.kind).toBe('content');
    if (result.kind === 'content') {
      expect(result.content[1]).toMatchObject({ type: 'image', mimeType: 'image/webp' });
    }
  });

  it('Given tool metadata, then natal-dependent tools are flagged correctly', () => {
    const required = new Set(
      MCP_TOOL_SPECS.filter((s) => s.requiresNatalChart).map((s) => s.name)
    );
    expect(required.has('get_transits')).toBe(true);
    expect(required.has('get_houses')).toBe(true);
    expect(required.has('get_rise_set_times')).toBe(true);
    expect(required.has('generate_natal_chart')).toBe(true);
    expect(required.has('generate_transit_chart')).toBe(true);
    expect(required.has('get_rising_sign_windows')).toBe(false);
  });

  it('Given chart tools return no payload, then execution throws explicit errors', async () => {
    const service = makeService();
    service.generateNatalChart.mockResolvedValue({ format: 'svg', text: 'oops' });
    await expect(
      getToolSpec('generate_natal_chart')!.execute(
        { service: service as any, natalChart: { name: 'chart' } as any },
        {}
      )
    ).rejects.toThrow(/no payload/i);
    service.generateTransitChart.mockResolvedValue({ format: 'svg', text: 'oops' });
    await expect(
      getToolSpec('generate_transit_chart')!.execute(
        { service: service as any, natalChart: { name: 'chart' } as any },
        {}
      )
    ).rejects.toThrow(/no payload/i);
  });

  it('Given timezone arguments and natal context, then non-natal tools apply timezone precedence correctly', async () => {
    const service = makeService();
    const retro = getToolSpec('get_retrograde_planets')!;
    const asteroids = getToolSpec('get_asteroid_positions')!;
    const eclipses = getToolSpec('get_next_eclipses')!;

    await retro.execute(
      { service: service as any, natalChart: { location: { timezone: 'Asia/Tokyo' } } as any },
      {}
    );
    await asteroids.execute(
      { service: service as any, natalChart: null },
      {}
    );
    await eclipses.execute(
      { service: service as any, natalChart: { location: { timezone: 'America/New_York' } } as any },
      { timezone: 'UTC' }
    );

    expect(service.resolveReportingTimezone).toHaveBeenCalledWith(undefined, 'Asia/Tokyo');
    expect(service.resolveReportingTimezone).toHaveBeenCalledWith(undefined, undefined);
    expect(service.resolveReportingTimezone).toHaveBeenCalledWith('UTC', 'America/New_York');
    expect(service.getRetrogradePlanets).toHaveBeenCalledWith('America/New_York');
    expect(service.getAsteroidPositions).toHaveBeenCalledWith('America/New_York');
    expect(service.getNextEclipses).toHaveBeenCalledWith('UTC');
  });
});
