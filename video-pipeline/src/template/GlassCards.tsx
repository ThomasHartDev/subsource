import React, { Suspense, useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { RoundedBox, Edges } from "@react-three/drei";
import { useThree, useLoader } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";

// One website panel: a tall full-page screenshot that scrolls through a
// portrait "window", mounted on a translucent glass slab with a neon rim.
export type GlassCard = {
  src: string; // staticFile-relative path under public/
  texW: number;
  texH: number;
  position: [number, number, number];
  rotationY: number;
  accent: string; // neon rim + glow color
  scrollPhase: number; // 0..1 offset so cards don't scroll in lockstep
};

export type GlassCardsProps = {
  cards: GlassCard[];
  music?: string; // staticFile-relative path, optional
  effects: "full" | "bloom" | "none";
};

const CARD_W = 2.4;
const CARD_H = 3.6;
const SLAB_PAD = 0.22;
const SLAB_DEPTH = 0.18;

// Soft radial alpha gradient — used for card backlight halos and the
// background orbs so nothing has a hard circle edge (cheaper than DOF blur).
function makeRadialTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ACES tone mapping crushes the bright website pixels; keep site planes
// unlit + untonemapped so the real colors survive, let the neon glass tonemap.
const Panel: React.FC<{ card: GlassCard; progress: number }> = ({
  card,
  progress,
}) => {
  const texture = useLoader(THREE.TextureLoader, staticFile(card.src));
  const glow = useMemo(makeRadialTexture, []);

  // Show a portrait window of the tall page and pan it top -> bottom.
  const repeatY = useMemo(() => {
    const cardAspect = CARD_H / CARD_W; // 1.5
    const texAspect = card.texH / card.texW; // tall => >1
    return Math.min(1, cardAspect / texAspect);
  }, [card.texH, card.texW]);

  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
  }, [texture]);

  // local scroll progress with per-card phase, eased, ping-pong so a short
  // clip still feels like a full read-through without a hard reset.
  const p = (progress + card.scrollPhase) % 1;
  const eased = p < 0.5 ? p * 2 : (1 - p) * 2; // 0->1->0
  // Mobile captures are content-rich top to bottom, so a fuller scroll reads as
  // a real page scroll without hitting the dark voids the desktop shots had.
  const travel = (1 - repeatY) * 0.85;
  texture.repeat.set(1, repeatY);
  texture.offset.set(0, 1 - repeatY - travel * eased);

  return (
    <group position={card.position} rotation={[0, card.rotationY, 0]}>
      {/* soft backlight halo so dark site tiles separate from the dark space */}
      <mesh position={[0, 0, -SLAB_DEPTH / 2 - 0.18]}>
        <planeGeometry args={[CARD_W * 2.0, CARD_H * 1.7]} />
        <meshBasicMaterial
          map={glow}
          color={card.accent}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* glass slab body */}
      <RoundedBox
        args={[CARD_W + SLAB_PAD, CARD_H + SLAB_PAD, SLAB_DEPTH]}
        radius={0.1}
        smoothness={4}
      >
        <meshPhysicalMaterial
          transmission={1}
          thickness={0.6}
          roughness={0.14}
          ior={1.45}
          clearcoat={1}
          clearcoatRoughness={0.1}
          color={card.accent}
          attenuationColor={card.accent}
          attenuationDistance={2.5}
          transparent
          opacity={1}
        />
        <Edges scale={1.002} threshold={15} color={card.accent} />
      </RoundedBox>

      {/* the website itself, crisp + unlit, just in front of the slab face */}
      <mesh position={[0, 0, SLAB_DEPTH / 2 + 0.012]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
};

// Multi-shot camera: each shot is its own framing with a from->to move, hard
// cut between shots for an edited feel. Cards live in a vertical cascade
// (forbidden mid, portfolio top, honey bottom) so shots can establish the
// whole stack, push in on the hero, or zoom each card.
type CamKey = { pos: [number, number, number]; look: [number, number, number]; fov: number };
type Shot = { frames: number; from: CamKey; to: CamKey };

const FORBIDDEN: [number, number, number] = [0.3, 0, 0.5];
const PORTFOLIO: [number, number, number] = [-1.0, 2.7, -0.6];
const HONEY: [number, number, number] = [-0.7, -2.7, -0.5];

export const SHOTS: Shot[] = [
  // 1. Wide establish — gentle orbit across the whole stack
  {
    frames: 90,
    from: { pos: [-3.0, 0.3, 10.6], look: [0, 0, 0], fov: 44 },
    to: { pos: [2.8, 0.7, 10.2], look: [0, 0.1, 0], fov: 44 },
  },
  // 2. Push-in on Forbidden (the hero)
  {
    frames: 90,
    from: { pos: [2.4, 0.2, 6.4], look: FORBIDDEN, fov: 38 },
    to: { pos: [0.5, 0.0, 4.9], look: FORBIDDEN, fov: 33 },
  },
  // 3. Zoom on the portfolio (slight up angle)
  {
    frames: 84,
    from: { pos: [-3.0, 2.3, 5.4], look: PORTFOLIO, fov: 38 },
    to: { pos: [-1.2, 2.7, 4.1], look: PORTFOLIO, fov: 33 },
  },
  // 4. Zoom on buzzed-honey
  {
    frames: 84,
    from: { pos: [1.8, -2.4, 5.6], look: HONEY, fov: 38 },
    to: { pos: [-0.5, -2.7, 4.2], look: HONEY, fov: 33 },
  },
  // 5. Sweeping crane: low on honey, rise across all three, pull back to wide
  {
    frames: 126,
    from: { pos: [4.0, -3.2, 6.6], look: [0, -2.2, 0], fov: 46 },
    to: { pos: [-2.2, 3.2, 10.4], look: [0, 1.2, 0], fov: 44 },
  },
];

export const SHOTS_FRAMES = SHOTS.reduce((a, s) => a + s.frames, 0);

const easeInOut = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const CameraRig: React.FC = () => {
  const frame = useCurrentFrame();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  let acc = 0;
  let shot = SHOTS[SHOTS.length - 1]!;
  let local = 1;
  for (const s of SHOTS) {
    if (frame < acc + s.frames) {
      shot = s;
      local = s.frames > 1 ? (frame - acc) / (s.frames - 1) : 0;
      break;
    }
    acc += s.frames;
  }

  const te = easeInOut(Math.max(0, Math.min(1, local)));
  const pos = lerp3(shot.from.pos, shot.to.pos, te);
  const look = lerp3(shot.from.look, shot.to.look, te);
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.fov = lerp(shot.from.fov, shot.to.fov, te);
  camera.lookAt(look[0], look[1], look[2]);
  camera.updateProjectionMatrix();
  return null;
};

// Big out-of-focus emissive blobs behind the cards. They feed bloom and give
// the glass something colorful to refract, so the dark space isn't empty.
const GlowField: React.FC = () => {
  const glow = useMemo(makeRadialTexture, []);
  const blobs: { p: [number, number, number]; c: string; r: number }[] = [
    { p: [-4, 1.5, -5], c: "#7c3aed", r: 3.0 },
    { p: [4.5, -1, -6], c: "#f59e0b", r: 3.4 },
    { p: [0, 2.5, -7], c: "#22d3ee", r: 2.8 },
    { p: [-2, -2.5, -4], c: "#ec4899", r: 2.2 },
  ];
  return (
    <>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p}>
          <planeGeometry args={[b.r * 2.4, b.r * 2.4]} />
          <meshBasicMaterial
            map={glow}
            color={b.c}
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
};

const Scene: React.FC<{ cards: GlassCard[]; effects: GlassCardsProps["effects"] }> = ({
  cards,
  effects,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;

  return (
    <>
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 9, 20]} />
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={40} color="#aab4ff" />
      <pointLight position={[-6, -2, 2]} intensity={30} color="#22d3ee" />
      <pointLight position={[0, 0, 6]} intensity={20} color="#ffffff" />

      <GlowField />
      <CameraRig />

      {cards.map((card, i) => (
        <Panel key={i} card={card} progress={progress} />
      ))}

      {effects !== "none" && (
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={1.15}
            luminanceThreshold={0.18}
            luminanceSmoothing={0.25}
          />
          {effects === "full" ? (
            <DepthOfField
              focusDistance={0.012}
              focalLength={0.045}
              bokehScale={4}
            />
          ) : (
            <></>
          )}
          <Vignette eskil={false} offset={0.25} darkness={0.85} />
        </EffectComposer>
      )}
    </>
  );
};

export const GlassCards: React.FC<GlassCardsProps> = ({ cards, music, effects }) => {
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#04050a" }}>
      <ThreeCanvas
        width={width}
        height={height}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ fov: 38, position: [0, 0.5, 10], near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <Scene cards={cards} effects={effects} />
        </Suspense>
      </ThreeCanvas>
      {music ? <Audio src={staticFile(music)} volume={0.85} /> : null}
    </AbsoluteFill>
  );
};
