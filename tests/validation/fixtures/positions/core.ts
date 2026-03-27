import { PLANETS } from '../../../../src/types.js';
import type { PositionFixture } from '../../utils/fixtureTypes.js';

export const positionFixtures: PositionFixture[] = [
  {
    name: 'spring-equinox-window',
    isoUtc: '2024-03-26T12:00:00Z',
    planetIds: [PLANETS.SUN, PLANETS.MOON, PLANETS.MERCURY, PLANETS.PLUTO],
    expected: [
      { body: 'Sun', longitude: 6.316731386907804, latitude: -0.00007352800431972934, speed: 0.9897125520461556, retrograde: false },
      { body: 'Moon', longitude: 199.48679716995002, latitude: -0.36176788562088447, speed: 11.94171311500129, retrograde: false },
      { body: 'Mercury', longitude: 24.69285200607294, latitude: 2.672580045178339, speed: 0.7867951188862425, retrograde: false },
      { body: 'Pluto', longitude: 301.7781198496598, latitude: -2.927662494192267, speed: 0.017128737345548647, retrograde: false },
    ],
  },
  {
    name: 'mercury-retrograde',
    isoUtc: '2024-04-10T12:00:00Z',
    planetIds: [PLANETS.MERCURY, PLANETS.VENUS, PLANETS.MARS],
    expected: [
      { body: 'Mercury', longitude: 23.614957304937263, latitude: 2.529284646399885, speed: -0.7176024601820039, retrograde: true },
      { body: 'Venus', longitude: 6.588795330387654, latitude: -1.4940621615222225, speed: 1.2350609766572045, retrograde: false },
      { body: 'Mars', longitude: 344.4004646784754, latitude: -1.2486830823566866, speed: 0.7771414567155127, retrograde: false },
    ],
  },
  {
    name: 'slow-movers',
    isoUtc: '2025-01-15T00:00:00Z',
    planetIds: [PLANETS.SATURN, PLANETS.URANUS, PLANETS.NEPTUNE, PLANETS.PLUTO],
    expected: [
      { body: 'Saturn', longitude: 345.7060989429216, latitude: -1.9494898994552385, speed: 0.0926345534031346, retrograde: false },
      { body: 'Uranus', longitude: 53.36875615623478, latitude: -0.24802075433686954, speed: -0.013507214995734195, retrograde: true },
      { body: 'Neptune', longitude: 357.54301992948785, latitude: -1.2774822956500207, speed: 0.02110565863427591, retrograde: false },
      { body: 'Pluto', longitude: 301.5060850985308, latitude: -3.288200764433513, speed: 0.032129088743535324, retrograde: false },
    ],
  },
  {
    name: 'millennium',
    isoUtc: '2000-01-01T12:00:00Z',
    planetIds: [PLANETS.SUN, PLANETS.JUPITER, PLANETS.PLUTO],
    expected: [
      { body: 'Sun', longitude: 280.36891967534336, latitude: 0.000232326514176311, speed: 1.0194320944210782, retrograde: false },
      { body: 'Jupiter', longitude: 25.253030309421774, latitude: -1.2621728355212258, speed: 0.040761317651403686, retrograde: false },
      { body: 'Pluto', longitude: 251.4547088467409, latitude: 10.855202461622458, speed: 0.035152902046821095, retrograde: false },
    ],
  },
  {
    name: 'far-future',
    isoUtc: '2099-12-31T00:00:00Z',
    planetIds: [PLANETS.SUN, PLANETS.MERCURY, PLANETS.NEPTUNE],
    expected: [
      { body: 'Sun', longitude: 279.58558664635507, latitude: 0.00011630013927636058, speed: 1.0187919739012508, retrograde: false },
      { body: 'Mercury', longitude: 286.38509679515437, latitude: -2.0863288163781823, speed: 1.6192452202966239, retrograde: false },
      { body: 'Neptune', longitude: 167.29687997613632, latitude: 0.9631918450180185, speed: -0.00662687644302578, retrograde: true },
    ],
  },
];
