// Global configuration for the Road-Safety City environment.
// World logic uses "map" coordinates (Blender X/Y, metres, Y = north). Use toWorld() to convert to three.js.

export const QUALITY = {
  low:    { label: 'נְמוּכָה', pixelRatioMax: 1.0, shadows: false, shadowSize: 0,    cars: 9,  peds: 8,  pairs: 1, cyclists: 1, birds: 1, clouds: 5 },
  medium: { label: 'בֵּינוֹנִית', pixelRatioMax: 1.5, shadows: true,  shadowSize: 1024, cars: 15, peds: 13, pairs: 2, cyclists: 2, birds: 2, clouds: 8 },
  high:   { label: 'גְּבוֹהָה', pixelRatioMax: 2.0, shadows: true,  shadowSize: 2048, cars: 21, peds: 16, pairs: 2, cyclists: 2, birds: 3, clouds: 11 },
};

// Camera viewpoints (map coords). target = look-at point, pos = camera position.
export const VIEWS = {
  overview:     { label: 'מַבָּט עַל',     target: [8, -2, 0],   pos: [20, -62, 52] },
  intersection: { label: 'הַצֹּמֶת',      target: [1, 0, 0],    pos: [17, -19, 12] },
  school:       { label: 'בֵּית הַסֵּפֶר',   target: [14, 9, 1],   pos: [19, -9, 9] },
  busstop:      { label: 'הַתַּחֲנָה',      target: [31, -5, 1],  pos: [21, 7, 9] },
  park:         { label: 'גַּן הַמִּשְׂחָקִים', target: [24, -22, 0], pos: [8, -40, 16] },
};

export const INTRO = {
  duration: 18,
  // camera positions / look-at targets in map coords (x, y, height)
  pos: [[-95, -95, 55], [-48, -14, 20], [-14, -7, 7], [6, -13, 9], [33, -10, 11], [44, -34, 22], [20, -62, 52]],
  tgt: [[0, 0, 0], [0, 1, 2], [10, 0, 2], [12, 16, 3], [30, -4, 1], [24, -22, 0], [8, -2, 0]],
};

export const BOUNDS = { min: -46, max: 46 };   // camera target clamp (map coords)

export const SIM = {
  carSpeed: 9.0,        // m/s (~32 km/h, school zone)
  busSpeed: 7.5,
  turnSpeed: 4.5,
  accel: 2.6, brake: 7.0, comfortBrake: 3.5,
};
