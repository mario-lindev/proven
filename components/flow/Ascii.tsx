"use client";

import { useCallback } from "react";
import AsciiCanvas, { type AsciiLayer } from "@/components/AsciiCanvas";

export const INK = "#14202b";
export const COBALT = "#2c46c9";
export const RUST = "#b4532a";

export type Phase = "idle" | "running" | "done";
const DEFAULT_COLORS = [COBALT, INK, RUST];

// Streams that merge into one line ("merge"), or one line that fans out into many ("split").
export function StreamBand({
  phase = "idle",
  mode = "merge",
  streams = 3,
  colors = DEFAULT_COLORS,
  label,
  className = "h-24",
}: {
  phase?: Phase;
  mode?: "merge" | "split";
  streams?: number;
  colors?: string[];
  label: string;
  className?: string;
}) {
  const layers = useCallback(
    (t: number, w: number, h: number): AsciiLayer[] => {
      const speed = phase === "running" ? 280 : 60;
      const pulses = phase === "running" ? 4 : 2;
      const join = 0.6;
      const mid = h / 2;
      const ease = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(1 - Math.max(0, k), 3));
      const yAt = (i: number, xr: number) => {
        const lane = streams === 1 ? 0 : (i / (streams - 1) - 0.5) * h * 0.74;
        const k = mode === "merge" ? ease(xr / join) : ease((1 - xr) / join);
        const wob = Math.sin(xr * 9 + t * 1.3 + i * 2) * h * 0.035 * (1 - k);
        return mid + lane * (1 - k) + wob;
      };
      const out: AsciiLayer[] = [];
      for (let i = 0; i < streams; i++) {
        out.push({
          color: colors[i % colors.length],
          alpha: phase === "idle" ? 0.7 : 1,
          draw: (s) => {
            s.fillStyle = "rgba(0,0,0,0.6)";
            for (let x = 0; x <= w; x += 3) s.fillRect(x, yAt(i, x / w) - 5, 3, 10);
            s.fillStyle = "#000";
            for (let p = 0; p < pulses; p++) {
              const px = ((t * speed + p * (w / pulses) + i * 57) % (w + 80)) - 40;
              s.beginPath();
              s.ellipse(px, yAt(i, Math.max(0, Math.min(1, px / w))), 30, 9, 0, 0, Math.PI * 2);
              s.fill();
            }
          },
        });
      }
      // The joined line, drawn last so it reads as one.
      out.push({
        color: phase === "done" ? COBALT : INK,
        draw: (s) => {
          s.fillStyle = phase === "done" ? "#000" : "rgba(0,0,0,0.7)";
          const x0 = mode === "merge" ? w * join : 0;
          const x1 = mode === "merge" ? w : w * (1 - join);
          s.fillRect(x0, mid - 6, x1 - x0, 12);
        },
      });
      return out;
    },
    [phase, mode, streams, colors],
  );
  return <AsciiCanvas label={label} layers={layers} cell={() => 7} reveal fps={phase === "running" ? 24 : 14} className={`block w-full ${className}`} />;
}

// A thin strip of moving glyphs, shown on a panel while it works.
export function ActivityStrip({ color = COBALT, label }: { color?: string; label: string }) {
  const layers = useCallback(
    (t: number, w: number, h: number): AsciiLayer[] => [
      {
        color,
        draw: (s) => {
          const head = ((t * 0.55) % 1.3) * w * 1.1 - w * 0.1;
          for (let k = 0; k < 14; k++) {
            s.fillStyle = `rgba(0,0,0,${0.9 - k * 0.06})`;
            s.fillRect(head - k * 14, 0, 14, h);
          }
          s.fillStyle = "rgba(0,0,0,0.16)";
          s.fillRect(0, h / 2 - 2, w, 4);
        },
      },
    ],
    [color],
  );
  return <AsciiCanvas label={label} layers={layers} cell={() => 5} fps={20} className="block h-4 w-full" />;
}
