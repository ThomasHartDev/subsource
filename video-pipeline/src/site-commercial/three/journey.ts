import * as THREE from "three";
import type { Spec3D, Stop } from "../types3d";

// World layout + the one continuous camera move.
//
// Stops sit every STOP_SPACING units down -Z on a gentle S-curve. The camera
// flies a centripetal Catmull-Rom spline threaded through an approach point
// and a linger point per stop. Time is eased per stop so the camera glides
// slow through the set piece and rips between stops. Everything is a pure
// function of frame — no clocks, fully deterministic.

const STOP_SPACING = 17;

export interface PlacedStop {
  stop: Stop;
  index: number;
  position: THREE.Vector3;
  // which side the camera passes on (alternates for variety)
  side: 1 | -1;
  frameWindow: [number, number];
  // curve samples inside this stop's window — ring tunnels thread these
  pathSamples: { point: THREE.Vector3; tangent: THREE.Vector3 }[];
}

export interface CameraState {
  position: THREE.Vector3;
  target: THREE.Vector3;
  roll: number;
  // world units per frame — drives starfield streaking
  speed: number;
  // index of the stop that currently owns the camera + 0..1 progress in it
  stopIndex: number;
  stopT: number;
}

export interface Journey {
  placed: PlacedStop[];
  curve: THREE.CatmullRomCurve3;
  totalFrames: number;
  camera: (frame: number) => CameraState;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// fast-slow-fast: derivative 1 + A·cos(2πt), so the camera lingers at the
// midpoint control (the stop) and rips across the gaps
const lingerEase = (t: number, amount = 0.55): number =>
  t - (amount / (2 * Math.PI)) * Math.sin(2 * Math.PI * t - Math.PI);

export function buildJourney(spec: Spec3D): Journey {
  const stops = spec.journey;
  const n = stops.length;

  const positions = stops.map(
    (_, i) =>
      new THREE.Vector3(
        Math.sin(i * 1.7) * 4.0,
        Math.cos(i * 1.3) * 1.5,
        -i * STOP_SPACING,
      ),
  );

  // control points: lead-in, then per stop approach A_i + linger L_i, then a
  // push-through tail so the final tangent stays alive
  const controls: THREE.Vector3[] = [];
  const approaches: THREE.Vector3[] = [];
  stops.forEach((stop, i) => {
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const p = positions[i]!;
    // tunnels want the camera dead-center through the rings; everything else
    // gets an angled flyby
    const lateral = stop.kind === "ring-tunnel" ? 0 : 2.4 * side;
    const a = p.clone().add(new THREE.Vector3(lateral * 1.3, 0.6, 9.5));
    const l = p
      .clone()
      .add(
        stop.kind === "ring-tunnel"
          ? new THREE.Vector3(0, 0, 0)
          : new THREE.Vector3(lateral, 0.25, 5.4),
      );
    approaches.push(a);
    controls.push(a, l);
  });
  controls.unshift(approaches[0]!.clone().add(new THREE.Vector3(0, 0.4, 7)));
  const lastL = controls[controls.length - 1]!;
  const lastP = positions[n - 1]!;
  controls.push(lastP.clone().add(lastL.clone().sub(lastP).multiplyScalar(0.25)));

  const curve = new THREE.CatmullRomCurve3(controls, false, "centripetal", 0.5);
  const k = controls.length - 1; // segments in parameter space

  // stop i owns parameter range from its approach control (index 1+2i) to the
  // next stop's approach (3+2i); the last stop runs to the tail control
  const tRange = (i: number): [number, number] => [
    (1 + 2 * i) / k,
    i < n - 1 ? (3 + 2 * i) / k : k / k,
  ];

  const fps = spec.fps;
  const frameCounts = stops.map((s) => Math.round(s.durationSec * fps));
  const totalFrames = frameCounts.reduce((a, b) => a + b, 0);
  const frameStarts: number[] = [];
  frameCounts.reduce((acc, c, i) => {
    frameStarts[i] = acc;
    return acc + c;
  }, 0);

  const placed: PlacedStop[] = stops.map((stop, i) => {
    const [t0, t1] = tRange(i);
    const samples =
      stop.kind === "ring-tunnel"
        ? Array.from({ length: 10 }, (_, j) => {
            const t = t0 + ((j + 0.5) / 10) * (t1 - t0) * 0.82;
            return { point: curve.getPoint(t), tangent: curve.getTangent(t).normalize() };
          })
        : [];
    return {
      stop,
      index: i,
      position: positions[i]!,
      side: i % 2 === 0 ? 1 : -1,
      frameWindow: [frameStarts[i]!, frameStarts[i]! + frameCounts[i]!] as [number, number],
      pathSamples: samples,
    };
  });

  const paramAt = (frame: number): { t: number; stopIndex: number; stopT: number } => {
    const f = Math.min(frame, totalFrames - 1);
    let i = 0;
    while (i < n - 1 && f >= frameStarts[i + 1]!) i++;
    const localT = clamp01((f - frameStarts[i]!) / Math.max(1, frameCounts[i]! - 1));
    const [t0, t1] = tRange(i);
    return { t: t0 + lingerEase(localT) * (t1 - t0), stopIndex: i, stopT: localT };
  };

  const camera = (frame: number): CameraState => {
    const { t, stopIndex, stopT } = paramAt(frame);
    const position = curve.getPoint(t);
    const ahead = curve.getPoint(Math.min(1, t + 0.004));

    // look at the current set piece, handing off to the next one late in the
    // stop so the turn happens mid-rip
    const here = positions[stopIndex]!;
    const next = positions[Math.min(stopIndex + 1, n - 1)]!;
    const hand = clamp01((stopT - 0.66) / 0.34);
    const handSmooth = hand * hand * (3 - 2 * hand);
    const target = here.clone().lerp(next, handSmooth);

    // bank into lateral motion
    const vel = ahead.clone().sub(position);
    const speed = vel.length() / 0.004 / Math.max(1, totalFrames) * 60;
    const roll = THREE.MathUtils.clamp(-vel.x * 9, -0.16, 0.16);

    return { position, target, roll, speed: vel.length(), stopIndex, stopT };
  };

  return { placed, curve, totalFrames, camera };
}
