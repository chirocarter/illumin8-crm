// The sample neck EMG read-out shown on the public screening forms
// (NeckScanPreview). Pure data + geometry, no React, so the picture can be
// checked without rendering the page.
//
// The screening scan covers the neck only: one reading on each side of every
// cervical vertebra, C1 through C7, coloured the way the scanner's report
// colours them (white = within normal, green +1, blue +2, red +3).
//
// These numbers are an ILLUSTRATION, labelled "Sample read-out" on the page.
// C1, C3, C5 and C7 follow a real report's cervical readings; C2, C4 and C6
// are filled in to match. They are not anyone's result.

export type ScanLevel = 0 | 1 | 2 | 3;

export type NeckReading = {
  vertebra: string;
  left: number;   // µV
  leftLevel: ScanLevel;
  right: number;  // µV
  rightLevel: ScanLevel;
};

export const SAMPLE_NECK_SCAN: readonly NeckReading[] = [
  { vertebra: "C1", left: 4.8, leftLevel: 0, right: 6.4, rightLevel: 1 },
  { vertebra: "C2", left: 7.2, leftLevel: 1, right: 5.3, rightLevel: 0 },
  { vertebra: "C3", left: 21.2, leftLevel: 3, right: 8.8, rightLevel: 2 },
  { vertebra: "C4", left: 6.0, leftLevel: 0, right: 9.4, rightLevel: 2 },
  { vertebra: "C5", left: 5.1, leftLevel: 0, right: 11.2, rightLevel: 3 },
  { vertebra: "C6", left: 6.9, leftLevel: 1, right: 4.9, rightLevel: 0 },
  { vertebra: "C7", left: 4.5, leftLevel: 0, right: 14.0, rightLevel: 3 },
];

export const SCAN_LEVELS: Record<ScanLevel, { label: string; fill: string; stroke: string }> = {
  0: { label: "Normal", fill: "#ffffff", stroke: "#b8a79d" },
  1: { label: "Mild", fill: "#3f9d6b", stroke: "#3f9d6b" },
  2: { label: "Moderate", fill: "#3d6fd6", stroke: "#3d6fd6" },
  3: { label: "High", fill: "#df4b3f", stroke: "#df4b3f" },
};

// ── Geometry (SVG user units) ───────────────────────────────────────────────
export const VIEW = { x: 0, y: 58, w: 360, h: 260 } as const;
export const CENTER_X = 180;
const FIRST_Y = 166;       // C1, just under the hairline
const STEP_Y = 19.5;       // one vertebra
const GAP = 15;            // from the spine's centre to where a bar starts
const UNITS_PER_UV = 5.2;  // bar length per microvolt
export const BAR_H = 10;
export const VERTEBRA = { w: 26, h: 15 } as const;

export type BarGeom = {
  key: string;
  side: "left" | "right";
  x: number; y: number; w: number; h: number;
  level: ScanLevel;
  value: number;
  index: number;
};

export function neckScanRows(readings: readonly NeckReading[] = SAMPLE_NECK_SCAN) {
  return readings.map((r, i) => {
    const cy = FIRST_Y + i * STEP_Y;
    const lw = Math.max(10, r.left * UNITS_PER_UV);
    const rw = Math.max(10, r.right * UNITS_PER_UV);
    const left: BarGeom = {
      key: `${r.vertebra}-L`, side: "left", index: i,
      x: CENTER_X - GAP - lw, y: cy - BAR_H / 2, w: lw, h: BAR_H, level: r.leftLevel, value: r.left,
    };
    const right: BarGeom = {
      key: `${r.vertebra}-R`, side: "right", index: i,
      x: CENTER_X + GAP, y: cy - BAR_H / 2, w: rw, h: BAR_H, level: r.rightLevel, value: r.right,
    };
    return { vertebra: r.vertebra, cy, left, right };
  });
}

// ── The figure: back of the head, neck and shoulders ───────────────────────
// Drawn once by hand on the 360-wide canvas; the spine runs down x = 180.
export const FIGURE = {
  // Neck flaring into the trapezius and out past both edges of the canvas.
  body:
    "M146 120 C146 166 144 198 136 220 C124 244 96 258 62 270 C38 279 14 292 -6 304 L-6 330 L366 330 L366 304 C346 292 322 279 298 270 C264 258 236 244 224 220 C216 198 214 166 214 120 Z",
  // Soft shading down each side of the neck and along the trapezius ridge.
  shade: [
    "M146 140 C146 172 144 200 136 220 C124 244 96 258 62 270 C100 264 132 250 150 232 C156 206 156 172 156 140 Z",
    "M214 140 C214 172 216 200 224 220 C236 244 264 258 298 270 C260 264 228 250 210 232 C204 206 204 172 204 140 Z",
  ],
  earLeft: { cx: 113, cy: 86, rx: 9, ry: 17 },
  earRight: { cx: 247, cy: 86, rx: 9, ry: 17 },
  // Back of the head (cropped by the view box) with a soft nape hairline.
  hair:
    "M180 -6 C222 -6 250 24 250 72 C250 104 240 128 226 144 C214 152 200 150 190 156 C186 158 183 160 180 160 C177 160 174 158 170 156 C160 150 146 152 134 144 C120 128 110 104 110 72 C110 24 138 -6 180 -6 Z",
  // A few strands, drawn as faint highlights.
  strands: [
    "M180 4 C168 40 160 90 164 140",
    "M180 4 C192 40 200 90 196 140",
    "M180 4 C150 30 132 70 132 120",
    "M180 4 C210 30 228 70 228 120",
  ],
} as const;
