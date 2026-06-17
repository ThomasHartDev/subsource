import { useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";

// Canvas-baked textures + render-safe image loading. Everything unlit: the
// whole aesthetic is emissive surfaces in a black void, which also keeps
// software-GL render times sane (no lights, no shadows).

const textureCache = new Map<string, THREE.Texture>();

// soft radial bloom sprite — our stand-in for postprocessing bloom
export function glowTexture(color: string, size = 256): THREE.Texture {
  const key = `glow:${color}:${size}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const col = new THREE.Color(color);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  g.addColorStop(0, `rgba(${rgb},0.85)`);
  g.addColorStop(0.25, `rgba(${rgb},0.32)`);
  g.addColorStop(0.6, `rgba(${rgb},0.08)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  textureCache.set(key, tex);
  return tex;
}

// dark glass card with a faint border — review cards, text plates
export function cardTexture(opts: {
  width: number;
  height: number;
  radius: number;
  border: string;
}): THREE.Texture {
  const key = `card:${opts.width}x${opts.height}:${opts.border}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = opts.width;
  c.height = opts.height;
  const ctx = c.getContext("2d")!;
  const r = opts.radius;
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(2, 2, opts.width - 4, opts.height - 4, r);
  };
  path();
  const g = ctx.createLinearGradient(0, 0, 0, opts.height);
  g.addColorStop(0, "rgba(22,24,30,0.92)");
  g.addColorStop(1, "rgba(10,11,14,0.92)");
  ctx.fillStyle = g;
  ctx.fill();
  path();
  ctx.strokeStyle = opts.border;
  ctx.lineWidth = 3;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  textureCache.set(key, tex);
  return tex;
}

// site capture / logo → texture. Suspends while loading; ThreeCanvas's
// built-in SuspenseLoader holds the render via delayRender until resolved.
// (A hand-rolled delayRender-in-useEffect inside the R3F tree deadlocks:
// the renderer waits on delayRender while the effect waits on a commit.)
export function useImageTexture(url: string): THREE.Texture {
  const tex = useTexture(url);
  return useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [tex]);
}

export function useGlow(color: string): THREE.Texture {
  return useMemo(() => glowTexture(color), [color]);
}
