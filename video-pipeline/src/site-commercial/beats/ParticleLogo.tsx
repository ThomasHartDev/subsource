import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ParticleLogoBeat } from "../types";
import { clamp01, houseEase, lerp, mulberry32 } from "../lib/motion";

const FONT_STACK = '"Inter", "Helvetica Neue", "Arial", "Segoe UI", sans-serif';
const MAX_PARTICLES = 1500;
// sampling grid for the logo alpha mask — 240px is plenty for a mark
const SAMPLE = 240;

interface Pt {
  x: number; // 0..1 inside the logo box
  y: number;
}

// Pull particle targets out of the logo's alpha channel. Runs once per render
// behind delayRender so the renderer waits for the mask.
function useLogoPoints(src: string): Pt[] | null {
  const [points, setPoints] = useState<Pt[] | null>(null);
  const [handle] = useState(() => delayRender("sampling logo alpha"));

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = SAMPLE;
        c.height = SAMPLE;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
        const all: Pt[] = [];
        for (let y = 0; y < SAMPLE; y++) {
          for (let x = 0; x < SAMPLE; x++) {
            if ((data[(y * SAMPLE + x) * 4 + 3] ?? 0) > 110) {
              all.push({ x: (x + 0.5) / SAMPLE, y: (y + 0.5) / SAMPLE });
            }
          }
        }
        if (all.length === 0) throw new Error(`logo mask empty: ${src}`);
        // deterministic thinning to the particle budget
        const stride = Math.max(1, all.length / MAX_PARTICLES);
        const picked: Pt[] = [];
        for (let i = 0; i < all.length; i += stride) {
          const p = all[Math.floor(i)];
          if (p) picked.push(p);
        }
        setPoints(picked);
        continueRender(handle);
      } catch (err) {
        cancelRender(err);
      }
    };
    img.onerror = () => cancelRender(new Error(`failed to load logo: ${src}`));
    img.src = src;
  }, [src, handle]);

  return points;
}

interface ParticleLogoProps {
  beat: ParticleLogoBeat;
  accent: string;
  fg: string;
  bg: string;
}

// Opening beat: a cloud of particles swirls in from off-frame and condenses
// into the brand mark, then the wordmark types up underneath.
export const ParticleLogo: React.FC<ParticleLogoProps> = ({ beat, accent, fg, bg }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = useLogoPoints(staticFile(beat.logoSrc));

  const durFrames = Math.round(beat.durationSec * fps);
  // particles finish condensing at 62% of the beat; text owns the rest
  const convergeEnd = Math.round(durFrames * 0.62);

  const logoBox = Math.round(Math.min(width, height) * 0.46);
  const boxLeft = (width - logoBox) / 2;
  const boxTop = height * (beat.title ? 0.30 : 0.5) - logoBox / 2;

  // per-particle static params, computed once
  const particles = useMemo(() => {
    if (!points) return null;
    const cx = width / 2;
    const cy = boxTop + logoBox / 2;
    return points.map((p, i) => {
      const rng = mulberry32(i * 2654435761 + 97);
      const angle = rng() * Math.PI * 2;
      const radius = (0.55 + rng() * 0.75) * Math.hypot(width, height) * 0.5;
      return {
        tx: boxLeft + p.x * logoBox,
        ty: boxTop + p.y * logoBox,
        sx: cx + Math.cos(angle) * radius,
        sy: cy + Math.sin(angle) * radius,
        delay: rng() * 0.22,
        curl: (rng() - 0.5) * logoBox * 0.7,
        size: 1.1 + rng() * 1.7,
        accent: rng() < 0.16,
        twinkle: rng() * Math.PI * 2,
      };
    });
  }, [points, width, height, boxLeft, boxTop, logoBox]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !particles) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    const tGlobal = clamp01(frame / convergeEnd);

    for (const pt of particles) {
      const local = clamp01((tGlobal - pt.delay) / (1 - pt.delay));
      // ease-out quint: fast launch, long settle into place
      const e = 1 - (1 - local) ** 5;
      const bx = lerp(pt.sx, pt.tx, e);
      const by = lerp(pt.sy, pt.ty, e);
      // perpendicular curl peaks mid-flight so paths arc instead of beelining
      const arc = Math.sin(local * Math.PI) * pt.curl * (1 - e);
      const dx = pt.tx - pt.sx;
      const dy = pt.ty - pt.sy;
      const len = Math.hypot(dx, dy) || 1;
      const x = bx + (-dy / len) * arc;
      const y = by + (dx / len) * arc;

      const settled = local >= 1;
      const shimmer = settled ? 0.82 + 0.18 * Math.sin(frame * 0.22 + pt.twinkle) : 1;
      const alpha = (0.25 + 0.75 * e) * shimmer;
      const color = pt.accent ? accent : fg;

      // soft halo + hard core, cheaper than shadowBlur at this count
      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, pt.size * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, [frame, particles, width, height, convergeEnd, accent, fg]);

  const titleStart = convergeEnd + Math.round(fps * 0.12);
  const titleT = interpolate(frame, [titleStart, titleStart + Math.round(fps * 0.4)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: houseEase,
  });
  const subT = interpolate(
    frame,
    [titleStart + Math.round(fps * 0.18), titleStart + Math.round(fps * 0.55)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: houseEase },
  );

  const glowT = clamp01(frame / convergeEnd);
  const titleSize = Math.round(width * 0.075);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      {/* dark theme = soft luminous: a quiet radial glow behind the mark */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle ${logoBox * 1.4}px at 50% ${boxTop + logoBox / 2}px, rgba(255,255,255,${0.07 * glowT}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />
      <canvas ref={canvasRef} width={width} height={height} style={{ width, height }} />
      {beat.title ? (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: boxTop + logoBox + Math.round(height * 0.045),
          }}
        >
          <div
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 800,
              fontSize: titleSize,
              letterSpacing: "-0.02em",
              color: fg,
              opacity: titleT,
              transform: `translateY(${(1 - titleT) * titleSize * 0.5}px)`,
            }}
          >
            {beat.title}
          </div>
          {beat.subtitle ? (
            <div
              style={{
                fontFamily: FONT_STACK,
                fontWeight: 500,
                fontSize: Math.round(width * 0.030),
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: accent,
                marginTop: Math.round(titleSize * 0.45),
                opacity: subT,
                transform: `translateY(${(1 - subT) * 14}px)`,
              }}
            >
              {beat.subtitle}
            </div>
          ) : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
