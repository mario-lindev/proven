"use client";

import { useCallback } from "react";
import AsciiCanvas, { type AsciiLayer } from "../AsciiCanvas";

// Small ASCII motifs drawn with AsciiCanvas.
// rule: a vertical fault line between two sides of a face-off.
// wave: a live audio-style waveform (Live Room while listening).
// scan: a soft band sweeping left to right (a check still running).
export default function AsciiStrip({
  kind,
  color,
  label,
  className = "",
}: {
  kind: "rule" | "wave" | "scan";
  color: string;
  label: string;
  className?: string;
}) {
  const layers = useCallback(
    (t: number, w: number, h: number): AsciiLayer[] => [
      {
        color,
        draw: (s) => {
          s.fillStyle = "#000";
          if (kind === "rule") {
            // A jagged column: its width breathes down the strip and drifts slowly.
            for (let y = 0; y < h; y += 4) {
              const k = 0.5 + 0.5 * Math.sin(y * 0.045 - t * 1.4) * Math.cos(y * 0.013 + t * 0.6);
              const bw = w * (0.18 + 0.62 * k);
              s.globalAlpha = 0.35 + 0.65 * k;
              s.fillRect((w - bw) / 2, y, bw, 4);
            }
          } else if (kind === "wave") {
            for (let x = 0; x < w; x += 3) {
              const env = 0.25 + 0.75 * Math.abs(Math.sin(x * 0.021 + t * 2.1) * Math.sin(x * 0.007 - t * 0.9));
              const a = (h / 2) * env * (0.7 + 0.3 * Math.sin(x * 0.31 + t * 9));
              s.globalAlpha = 0.5 + 0.5 * env;
              s.fillRect(x, h / 2 - a, 3, a * 2);
            }
          } else {
            const p = ((t * 0.45) % 1.4) - 0.2;
            for (let x = 0; x < w; x += 4) {
              const k = Math.max(0, 1 - Math.abs(x / w - p) / 0.18);
              s.globalAlpha = 0.12 + 0.6 * k;
              s.fillRect(x, 0, 4, h);
            }
          }
          s.globalAlpha = 1;
        },
      },
    ],
    [kind, color],
  );
  return (
    <AsciiCanvas
      label={label}
      className={`block ${className}`}
      layers={layers}
      cell={() => 5}
      fps={kind === "wave" ? 24 : 14}
      still={2}
    />
  );
}
