"use client";

import AsciiCanvas, { type AsciiLayer } from "@/components/AsciiCanvas";

// Many sources drift in, get pulled through one router, and leave as blocks
// that stack into a few verified columns. Positions are fractions of the canvas
// so the DOM labels on the home page line up with the drawing.
export const GEO = { rx: 0.76, ry: 0.5, lanes: [0.855, 0.9, 0.945], floor: 0.8 };

const DOCS = 34;
const PACKETS = 9;
const rnd = (i: number, k: number) => {
  const n = Math.sin(i * 91.7 + k * 47.3) * 43758.5453;
  return n - Math.floor(n);
};
const frac = (x: number) => x - Math.floor(x);

function page(s: CanvasRenderingContext2D, x: number, y: number, pw: number, ph: number) {
  s.fillStyle = "#8a8a8a";
  s.fillRect(x, y, pw, ph);
  // lines of text on the page read as darker rows of glyphs
  s.fillStyle = "#111";
  for (let ly = y + ph * 0.2, n = 0; ly < y + ph * 0.85; ly += ph * 0.22, n++) {
    s.fillRect(x + pw * 0.14, ly, pw * (n === 0 ? 0.45 : 0.72), Math.max(3, ph * 0.09));
  }
}

function layers(t: number, w: number, h: number): AsciiLayer[] {
  const rx = w * GEO.rx, ry = h * GEO.ry;
  const docs = Array.from({ length: DOCS }, (_, i) => {
    const p = frac(t * 0.045 + i / DOCS + rnd(i, 9) * 0.03);
    const x0 = w * (0.5 + rnd(i, 1) * 0.22), y0 = h * (0.08 + rnd(i, 2) * 0.84);
    const e = p * p * p;
    return {
      p,
      x: x0 + (rx - x0) * e + Math.sin(t * 0.6 + i) * 6 * (1 - e),
      y: y0 + (ry - y0) * e + Math.cos(t * 0.5 + i * 2) * 5 * (1 - e),
      k: 1 - e * 0.85,
    };
  });
  const lanes = GEO.lanes.map((f) => w * f);
  const floor = h * GEO.floor;
  const bw = Math.max(36, w * 0.034), bh = 18, gap = 7;
  const stack = lanes.map((_, j) => 3 + Math.floor(frac(t * 0.03 + j * 0.37) * 6));
  const top = (j: number) => floor - stack[j] * (bh + gap);
  const bend = (j: number) => lanes[j] - bw * 0.9;

  return [
    {
      // query beams from the router out to the pages it is reading, and the routes to each column
      color: "#2d4faa",
      alpha: 0.85,
      draw: (s) => {
        s.strokeStyle = "#444";
        s.lineWidth = 3.2;
        for (const d of docs) {
          if (d.p < 0.35) continue;
          s.globalAlpha = Math.min(1, (d.p - 0.35) * 2.5);
          s.beginPath();
          s.moveTo(rx, ry);
          s.lineTo(d.x + 21 * d.k, d.y + 27 * d.k);
          s.stroke();
        }
        s.globalAlpha = 1;
        s.lineWidth = 4.5;
        lanes.forEach((lx, j) => {
          s.beginPath();
          s.moveTo(rx, ry);
          s.lineTo(bend(j), ry);
          s.lineTo(lx, top(j) - 18);
          s.stroke();
        });
      },
    },
    {
      // the source pages, the verified stacks and the packets in flight
      color: "#263c59",
      alpha: 0.95,
      draw: (s) => {
        for (const d of docs) page(s, d.x, d.y, 42 * d.k, 54 * d.k);
        lanes.forEach((lx, j) => {
          for (let b = 0; b < stack[j]; b++) {
            s.fillStyle = "#333";
            s.fillRect(lx - bw / 2, floor - (b + 1) * (bh + gap), bw, bh);
          }
        });
        s.fillStyle = "#555";
        s.fillRect(lanes[0] - bw, floor + 6, lanes[2] - lanes[0] + bw * 2, 3);
        for (let j = 0; j < PACKETS; j++) {
          const q = frac(t * 0.11 + j / PACKETS);
          const lane = j % 3, lx = lanes[lane], ty = top(lane) - 18, bx = bend(lane);
          const seg1 = bx - rx, seg2 = Math.hypot(lx - bx, ty - ry);
          const at = q * (seg1 + seg2);
          const u = (at - seg1) / seg2;
          const [px, py] = at < seg1 ? [rx + at, ry] : [bx + (lx - bx) * u, ry + (ty - ry) * u];
          s.fillStyle = "#222";
          s.fillRect(px - 8, py - 6, 16, 12);
        }
      },
    },
    {
      // the one warm accent: the router, and the block being locked in
      color: "#c4622d",
      draw: (s) => {
        const pulse = 1 + Math.sin(t * 1.6) * 0.06;
        s.strokeStyle = "#111";
        s.lineWidth = 11;
        s.beginPath();
        s.arc(rx, ry, 44 * pulse, 0, Math.PI * 2);
        s.stroke();
        s.fillStyle = "#333";
        s.beginPath();
        s.arc(rx, ry, 16, 0, Math.PI * 2);
        s.fill();
        const j = Math.floor(t * 0.09) % 3;
        s.fillStyle = "#222";
        s.fillRect(lanes[j] - bw / 2, top(j), bw, bh);
      },
    },
  ];
}

export default function RouteScene() {
  return (
    <AsciiCanvas
      label="Source pages drift into a router and leave as verified blocks stacked in three columns"
      layers={layers}
      cell={(w) => (w < 900 ? 5 : 6)}
      fps={18}
      lens={{ radius: 96, color: "#2d4faa" }}
      reveal
      still={14}
    />
  );
}
