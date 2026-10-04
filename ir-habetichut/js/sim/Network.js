// Road + pedestrian network for the city (map coordinates, right-hand traffic, Israel).
// Lanes: main road E-W (y = ±1.75), cross road N-S (x = ±1.75), side street N (x 21..27), side street S (x -27..-21).

const END = 66;   // vehicles spawn/despawn here (fog + fade hide it)

function quad(p0, c, p1, n = 10) {
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}

// stop descriptors: { at:[x,y], kind:'light'|'stop'|'yield'|'bus', group?, check?, dwell? }
export const ROUTES = {
  EB: { w: 3, pts: [[-END, -1.75], [END, -1.75]], stops: [{ at: [-8.0, -1.75], kind: 'light', group: 'A', clear: 17 }, { at: [13.9, -1.75], kind: 'keepclear', clear: 3.6 }] },
  WB: { w: 3, pts: [[END, 1.75], [-END, 1.75]], stops: [{ at: [19.1, 1.75], kind: 'keepclear', clear: 3.6 }, { at: [8.0, 1.75], kind: 'light', group: 'A', clear: 17 }] },
  NB: { w: 1.6, pts: [[1.75, -END], [1.75, END]], stops: [{ at: [1.75, -8.0], kind: 'light', group: 'B', clear: 17 }] },
  SB: { w: 1.6, pts: [[-1.75, END], [-1.75, -END]], stops: [{ at: [-1.75, 8.0], kind: 'light', group: 'B', clear: 17 }] },
  WB_to_SideN: { w: 1, pts: [[END, 1.75], [29.5, 1.75], ...quad([29.5, 1.75], [25.5, 1.75], [25.5, 5.75]), [25.5, END]], stops: [] },
  SideN_to_WB: { w: 1, pts: [[22.5, END], [22.5, 7.0], ...quad([22.5, 7.0], [22.5, 1.75], [19.4, 1.75]), [-END, 1.75]],
    stops: [{ at: [22.5, 8.2], kind: 'stop', check: 'sideN', clear: 4 }, { at: [8.0, 1.75], kind: 'light', group: 'A', clear: 17 }] },
  SideS_to_EB: { w: 1, pts: [[-22.5, -END], [-22.5, -9.5], ...quad([-22.5, -9.5], [-22.5, -1.75], [-16.5, -1.75]), [END, -1.75]],
    stops: [{ at: [-22.5, -8.2], kind: 'yield', check: 'sideS', clear: 6 }, { at: [-8.0, -1.75], kind: 'light', group: 'A', clear: 17 }, { at: [13.9, -1.75], kind: 'keepclear', clear: 3.6 }] },
  EB_to_SideS: { w: 1, pts: [[-END, -1.75], [-29.5, -1.75], ...quad([-29.5, -1.75], [-25.5, -1.75], [-25.5, -5.75]), [-25.5, -END]], stops: [] },
  BUS: { w: 0, pts: [[-END, -1.75], [END, -1.75]],
    stops: [{ at: [-8.0, -1.75], kind: 'light', group: 'A', clear: 17 }, { at: [13.9, -1.75], kind: 'keepclear', clear: 3.6 }, { at: [37.0, -1.75], kind: 'bus', dwell: 7 }] },
};

// --- pedestrian graph ---------------------------------------------------------
// crossing kinds: 'light:EW_arm' (crosses main road), 'light:NS_arm' (crosses N-S road), 'zebra:<id>'
export const PED_NODES = {
  nW: [-38, 5.1], nShops: [-22, 5.1], cNW: [-5.5, 5.5], cNE: [5.5, 5.5], schN: [16.5, 5.1], sNw: [19.5, 5.1], sNe: [28.5, 5.1], nE: [38, 5.1],
  gate: [16.5, 9.3],
  sNw2: [19.5, 22], sNw3: [19.5, 38], sNe2: [28.5, 22], sNe3: [28.5, 38],
  xNW2: [-5.3, 22], xNW3: [-5.3, 38], xNE2: [5.3, 22], xNE3: [5.3, 38],
  sW: [-38, -5.1], sSw: [-28.5, -5.1], sSe: [-19.5, -5.1], cSW: [-5.5, -5.5], cSE: [5.5, -5.5], schS: [16.5, -5.1], pk: [24, -5.1], bus: [31, -5.4], sE: [38, -5.1],
  pkGate: [24, -12.6], pkIn: [24, -16],
  sSw2: [-28.5, -22], sSw3: [-28.5, -38], sSe2: [-19.5, -22], sSe3: [-19.5, -38],
  xSW2: [-5.3, -22], xSW3: [-5.3, -38], xSE2: [5.3, -22], xSE3: [5.3, -38],
};
export const PED_EDGES = [
  ['nW', 'nShops'], ['nShops', 'cNW'], ['cNE', 'schN'], ['schN', 'sNw'], ['sNe', 'nE'], ['schN', 'gate'],
  ['sNw', 'sNw2'], ['sNw2', 'sNw3'], ['sNe', 'sNe2'], ['sNe2', 'sNe3'],
  ['cNW', 'xNW2'], ['xNW2', 'xNW3'], ['cNE', 'xNE2'], ['xNE2', 'xNE3'],
  ['sW', 'sSw'], ['sSe', 'cSW'], ['cSE', 'schS'], ['schS', 'pk'], ['pk', 'bus'], ['bus', 'sE'], ['pk', 'pkGate'], ['pkGate', 'pkIn'],
  ['sSw', 'sSw2'], ['sSw2', 'sSw3'], ['sSe', 'sSe2'], ['sSe2', 'sSe3'],
  ['cSW', 'xSW2'], ['xSW2', 'xSW3'], ['cSE', 'xSE2'], ['xSE2', 'xSE3'],
  // crossings
  ['cNE', 'cSE', 'light:EW_arm'], ['cNW', 'cSW', 'light:EW_arm'],
  ['cNW', 'cNE', 'light:NS_arm'], ['cSW', 'cSE', 'light:NS_arm'],
  ['schN', 'schS', 'zebra:school'], ['sNw', 'sNe', 'zebra:sideN'], ['sSw', 'sSe', 'zebra:sideS'],
];
// cyclists ride the red bike lane on the north side of the main road (y = 7.6)
export const BIKE_NODES = { b0: [-38, 7.6], b1: [-4.4, 7.6], b2: [4.4, 7.6], b3: [20.4, 7.6], b4: [27.6, 7.6], b5: [38, 7.6] };
export const BIKE_EDGES = [['b0', 'b1'], ['b1', 'b2', 'light:NS_arm'], ['b2', 'b3'], ['b3', 'b4', 'zebra:sideNbike'], ['b4', 'b5']];
// zebra crossing centres (for "is the road clear?" checks)
export const ZEBRAS = { school: [16.5, 0], sideN: [24, 5.5], sideS: [-24, -5.5], sideNbike: [24, 7.6] };
