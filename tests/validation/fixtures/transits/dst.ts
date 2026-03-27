export interface DstFixture {
  name: string;
  timezone: string;
  local: { year: number; month: number; day: number; hour: number; minute: number };
  kind: 'ambiguous' | 'nonexistent';
}

export const dstFixtures: DstFixture[] = [
  {
    name: 'dst-ambiguous-local-time',
    timezone: 'America/New_York',
    local: { year: 2024, month: 11, day: 3, hour: 1, minute: 30 },
    kind: 'ambiguous',
  },
  {
    name: 'dst-nonexistent-local-time',
    timezone: 'America/New_York',
    local: { year: 2024, month: 3, day: 10, hour: 2, minute: 30 },
    kind: 'nonexistent',
  },
];
