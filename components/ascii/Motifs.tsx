"use client";

import AsciiCanvas, { type AsciiLayer } from "@/components/AsciiCanvas";

// Small ASCII motifs for the four steps on the home page. Drawn for a dark band.
const LIGHT = "#d7deea";
const RUST = "#e08a5a";
const small = () => 5;

const scenes: Record<string, (t: number, w: number, h: number) => AsciiLayer[]> = {
  // one question fans out into several searches
  plan: (t, w, h) => [
    {
      color: LIGHT,
      draw: (s) => {
        s.fillStyle = "#333";
        s.fillRect(w * 0.08, h * 0.38, w * 0.16, h * 0.24);
        s.strokeStyle = "#555";
        s.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const y = h * (0.12 + i * 0.19);
          s.beginPath();
          s.moveTo(w * 0.24, h * 0.5);
          s.lineTo(w * 0.7, y);
          s.stroke();
          s.fillRect(w * 0.72, y - 5, w * 0.2, 10);
        }
      },
    },
    {
      color: RUST,
      draw: (s) => {
        const i = Math.floor(t * 1.2) % 5;
        s.fillStyle = "#222";
        s.fillRect(w * 0.72, h * (0.12 + i * 0.19) - 5, w * 0.2, 10);
      },
    },
  ],
  // a router sweeping across engines
  route: (t, w, h) => [
    {
      color: LIGHT,
      draw: (s) => {
        s.fillStyle = "#444";
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          s.fillRect(w / 2 + Math.cos(a) * h * 0.4 - 5, h / 2 + Math.sin(a) * h * 0.4 - 5, 10, 10);
        }
        s.strokeStyle = "#555";
        s.lineWidth = 3;
        s.beginPath();
        s.arc(w / 2, h / 2, h * 0.16, 0, Math.PI * 2);
        s.stroke();
      },
    },
    {
      color: RUST,
      draw: (s) => {
        const a = t * 1.1;
        s.strokeStyle = "#222";
        s.lineWidth = 5;
        s.beginPath();
        s.moveTo(w / 2, h / 2);
        s.lineTo(w / 2 + Math.cos(a) * h * 0.4, h / 2 + Math.sin(a) * h * 0.4);
        s.stroke();
      },
    },
  ],
  // a scan line checks a page; checked lines get a mark
  prove: (t, w, h) => {
    const y0 = h * 0.12, rows = 6, gap = (h * 0.76) / rows;
    const at = (t * 0.5) % 1;
    return [
      {
        color: LIGHT,
        draw: (s) => {
          s.fillStyle = "#555";
          for (let i = 0; i < rows; i++) s.fillRect(w * 0.15, y0 + i * gap, w * (i % 3 === 2 ? 0.4 : 0.55), 8);
          s.fillStyle = "#222";
          s.fillRect(w * 0.1, y0 + at * rows * gap - 2, w * 0.8, 3);
        },
      },
      {
        color: RUST,
        draw: (s) => {
          s.fillStyle = "#222";
          for (let i = 0; i < rows; i++) if (i < at * rows && i !== 3) s.fillRect(w * 0.78, y0 + i * gap - 1, 10, 10);
        },
      },
    ];
  },
  // engines whose pages held up grow
  learn: (t, w, h) => [
    {
      color: LIGHT,
      draw: (s) => {
        s.fillStyle = "#444";
        for (let i = 0; i < 6; i++) {
          const v = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.5 + i * 1.3)) * (1 - i * 0.1);
          s.fillRect(w * (0.12 + i * 0.13), h * (0.88 - v * 0.76), w * 0.08, h * v * 0.76);
        }
      },
    },
    {
      color: RUST,
      draw: (s) => {
        s.fillStyle = "#222";
        s.fillRect(w * 0.1, h * 0.9, w * 0.8, 3);
      },
    },
  ],
};

export default function Motif({ kind, label }: { kind: keyof typeof scenes; label: string }) {
  return <AsciiCanvas label={label} layers={scenes[kind]} cell={small} fps={12} still={2} />;
}
