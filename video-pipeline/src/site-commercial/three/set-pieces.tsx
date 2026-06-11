import React, { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { staticFile } from "remotion";
import type { PlacedStop, Journey } from "./journey";
import type { Review, Spec3D } from "../types3d";
import { cardTexture, useGlow, useImageTexture } from "./textures";
import { mulberry32 } from "../lib/motion";

export const FONT_BOLD = "site-commercial/fonts/Inter-Bold.woff";
export const FONT_REG = "site-commercial/fonts/Inter-Regular.woff";

// Fonts are preloaded with delayRender OUTSIDE the canvas (see useFontPreload
// in SiteCommercial3D) — a delayRender inside the R3F tree deadlocks against
// @remotion/three's frame gating. By first paint the glyphs are warm.
const T = Text;

// fog hides geometry at distance but crisp white text stays readable — fade
// stop text in as the camera actually arrives
const stopTextOpacity = (placed: PlacedStop, frame: number, fps: number): number => {
  const lead = Math.round(fps * 0.9);
  const [f0] = placed.frameWindow;
  const t = (frame - (f0 - lead)) / lead;
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const ADD = THREE.AdditiveBlending;

export const Glow: React.FC<{
  color: string;
  scale: number;
  opacity?: number;
  position?: [number, number, number];
}> = ({ color, scale, opacity = 0.9, position = [0, 0, 0] }) => {
  const tex = useGlow(color);
  return (
    <sprite position={position} scale={[scale, scale, 1]}>
      <spriteMaterial
        map={tex}
        blending={ADD}
        depthWrite={false}
        transparent
        opacity={opacity}
      />
    </sprite>
  );
};

// ---- starfield ----------------------------------------------------------

export const Starfield: React.FC<{ depth: number; frame: number }> = ({ depth, frame }) => {
  const geo = useMemo(() => {
    const rng = mulberry32(1337);
    const count = 1400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() - 0.5) * 46;
      pos[i * 3 + 1] = (rng() - 0.5) * 30;
      pos[i * 3 + 2] = -rng() * (depth + 30) + 12;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [depth]);

  // slow communal drift sells "alive", stays deterministic
  const y = Math.sin(frame * 0.004) * 0.35;
  return (
    <group position={[0, y, 0]}>
      <points geometry={geo}>
        <pointsMaterial
          color="#9aa3b5"
          size={0.05}
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </points>
    </group>
  );
};

// ---- set pieces ----------------------------------------------------------

const Monolith: React.FC<{ placed: PlacedStop; spec: Spec3D; frame: number }> = ({
  placed,
  spec,
  frame,
}) => {
  if (placed.stop.kind !== "site-monolith") return null;
  const { stop, position, side, index } = placed;
  const tex = useImageTexture(staticFile(stop.src));
  const aspect = stop.imageW / stop.imageH;
  // tall mobile captures become doorways, wide desktop captures become walls
  // sized so the linger framing keeps the full panel inside a 9:16 frame
  const h = aspect < 1 ? 6.4 : 4.8 / aspect;
  const w = aspect < 1 ? 6.4 * aspect : 4.8;

  const bob = Math.sin(frame * 0.02 + index * 2) * 0.12;
  const sway = Math.sin(frame * 0.011 + index) * 0.02;
  const textVis = stopTextOpacity(placed, frame, spec.fps);

  return (
    <group
      position={[position.x, position.y + bob, position.z]}
      rotation={[0, side * -0.22 + sway, 0]}
    >
      <Glow color={spec.brand.accent} scale={Math.max(w, h) * 2.6} opacity={0.5} />
      {/* accent frame peeking out behind the capture */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[w + 0.1, h + 0.1]} />
        <meshBasicMaterial color={spec.brand.accent} transparent opacity={0.85} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* faint floor reflection */}
      <mesh position={[0, -h - 0.06, 0]} scale={[1, -1, 1]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent opacity={0.07} depthWrite={false} />
      </mesh>
      {stop.headline ? (
        <group position={[side * (w / 2 + 1.7), 0.4, 0.6]} rotation={[0, side * -0.3, 0]}>
          <T
            font={staticFile(FONT_BOLD)}
            fontSize={0.46}
            maxWidth={3.2}
            color={spec.brand.fg}
            anchorX={side > 0 ? "left" : "right"}
            anchorY="middle"
            lineHeight={1.12}
            textAlign={side > 0 ? "left" : "right"}
            fillOpacity={textVis}
          >
            {stop.headline}
          </T>
          {stop.sub ? (
            <T
              font={staticFile(FONT_REG)}
              fontSize={0.2}
              maxWidth={3.0}
              color="#8d94a3"
              anchorX={side > 0 ? "left" : "right"}
              anchorY="top"
              position={[0, -0.65, 0]}
              lineHeight={1.3}
              textAlign={side > 0 ? "left" : "right"}
              fillOpacity={textVis}
            >
              {stop.sub}
            </T>
          ) : null}
        </group>
      ) : null}
    </group>
  );
};

const RingTunnel: React.FC<{ placed: PlacedStop; spec: Spec3D; frame: number }> = ({
  placed,
  spec,
  frame,
}) => {
  if (placed.stop.kind !== "ring-tunnel") return null;
  const accent2 = spec.brand.accent2 ?? spec.brand.accent;
  const boxes = useMemo(() => {
    const rng = mulberry32(77 + placed.index);
    return Array.from({ length: 14 }, () => ({
      angle: rng() * Math.PI * 2,
      radius: 4.5 + rng() * 3.5,
      size: 0.25 + rng() * 0.5,
      spin: (rng() - 0.5) * 0.02,
      along: rng(),
    }));
  }, [placed.index]);

  return (
    <group>
      {placed.pathSamples.map(({ point, tangent }, i) => {
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          tangent,
        );
        const pulse = 0.55 + 0.3 * Math.sin(frame * 0.12 - i * 0.9);
        return (
          <mesh key={i} position={point} quaternion={q}>
            <torusGeometry args={[2.7, 0.03, 8, 48]} />
            <meshBasicMaterial
              color={i % 3 === 0 ? spec.brand.accent : accent2}
              transparent
              opacity={pulse}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      {boxes.map((b, i) => {
        const base = placed.pathSamples[Math.floor(b.along * (placed.pathSamples.length - 1))];
        if (!base) return null;
        const x = base.point.x + Math.cos(b.angle) * b.radius;
        const y = base.point.y + Math.sin(b.angle) * b.radius;
        return (
          <mesh key={`b${i}`} position={[x, y, base.point.z]} rotation={[frame * b.spin, frame * b.spin * 1.3, 0]}>
            <boxGeometry args={[b.size, b.size, b.size]} />
            <meshBasicMaterial color={accent2} wireframe transparent opacity={0.55} />
          </mesh>
        );
      })}
      {placed.stop.text ? (
        <T
          font={staticFile(FONT_BOLD)}
          fontSize={0.42}
          maxWidth={4.5}
          color={spec.brand.fg}
          anchorX="center"
          anchorY="middle"
          textAlign="center"
          position={[placed.position.x, placed.position.y - 1.35, placed.position.z]}
          fillOpacity={stopTextOpacity(placed, frame, spec.fps)}
        >
          {placed.stop.text}
        </T>
      ) : null}
    </group>
  );
};

const ReviewCard: React.FC<{
  review: Review;
  spec: Spec3D;
  position: [number, number, number];
  rotY: number;
  frame: number;
  seed: number;
  vis: number;
}> = ({ review, spec, position, rotY, frame, seed, vis }) => {
  const tex = useMemo(
    () => cardTexture({ width: 640, height: 400, radius: 36, border: "rgba(255,255,255,0.16)" }),
    [],
  );
  const bob = Math.sin(frame * 0.016 + seed * 2.4) * 0.1;
  return (
    <group position={[position[0], position[1] + bob, position[2]]} rotation={[0, rotY, 0]}>
      <mesh>
        <planeGeometry args={[3.2, 2.0]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
      <T
        font={staticFile(FONT_BOLD)}
        fontSize={0.22}
        color={spec.brand.accent}
        anchorX="left"
        anchorY="top"
        position={[-1.35, 0.78, 0.01]}
        letterSpacing={0.12}
        fillOpacity={vis}
      >
        {"★".repeat(review.stars)}
      </T>
      <T
        font={staticFile(FONT_REG)}
        fontSize={0.155}
        maxWidth={2.7}
        color={spec.brand.fg}
        anchorX="left"
        anchorY="top"
        position={[-1.35, 0.42, 0.01]}
        lineHeight={1.32}
        fillOpacity={vis}
      >
        {`“${review.quote}”`}
      </T>
      <T
        font={staticFile(FONT_BOLD)}
        fontSize={0.14}
        color="#9aa3b5"
        anchorX="left"
        anchorY="bottom"
        position={[-1.35, -0.78, 0.01]}
        fillOpacity={vis}
      >
        {review.role ? `${review.name} · ${review.role}` : review.name}
      </T>
    </group>
  );
};

const ReviewField: React.FC<{ placed: PlacedStop; spec: Spec3D; frame: number }> = ({
  placed,
  spec,
  frame,
}) => {
  if (placed.stop.kind !== "review-field") return null;
  const { reviews, headline } = placed.stop;
  const p = placed.position;
  const vis = stopTextOpacity(placed, frame, spec.fps);
  return (
    <group>
      <Glow color={spec.brand.accent} scale={9} opacity={0.22} position={[p.x, p.y, p.z - 2]} />
      {headline ? (
        <T
          font={staticFile(FONT_BOLD)}
          fontSize={0.52}
          color={spec.brand.fg}
          anchorX="center"
          anchorY="middle"
          textAlign="center"
          maxWidth={5}
          position={[p.x, p.y + 2.6, p.z + 1]}
          fillOpacity={vis}
        >
          {headline}
        </T>
      ) : null}
      {reviews.map((r, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const z = p.z + 3.5 - i * 3.1;
        return (
          <ReviewCard
            key={i}
            review={r}
            spec={spec}
            position={[p.x + side * 2.75, p.y + (i % 3 === 0 ? 0.5 : -0.3), z]}
            rotY={side * -0.3}
            frame={frame}
            seed={i}
            vis={vis}
          />
        );
      })}
    </group>
  );
};

const TextMoment: React.FC<{ placed: PlacedStop; spec: Spec3D; frame: number }> = ({
  placed,
  spec,
  frame,
}) => {
  if (placed.stop.kind !== "text-moment") return null;
  const p = placed.position;
  const vis = stopTextOpacity(placed, frame, spec.fps);
  return (
    <group position={[p.x, p.y, p.z]}>
      <Glow color={spec.brand.accent} scale={7} opacity={0.16} position={[0, 0, -1.5]} />
      <T
        font={staticFile(FONT_BOLD)}
        fontSize={0.72}
        maxWidth={5.2}
        color={spec.brand.fg}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        lineHeight={1.1}
        fillOpacity={vis}
      >
        {placed.stop.headline}
      </T>
      {placed.stop.sub ? (
        <T
          font={staticFile(FONT_REG)}
          fontSize={0.26}
          maxWidth={4.6}
          color="#9aa3b5"
          anchorX="center"
          anchorY="top"
          textAlign="center"
          position={[0, -1.0, 0]}
          lineHeight={1.35}
          fillOpacity={vis}
        >
          {placed.stop.sub}
        </T>
      ) : null}
    </group>
  );
};

const LogoEmblem: React.FC<{ placed: PlacedStop; spec: Spec3D; frame: number }> = ({
  placed,
  spec,
  frame,
}) => {
  if (placed.stop.kind !== "logo-emblem") return null;
  const { stop } = placed;
  const tex = useImageTexture(staticFile(stop.logoSrc));
  const p = placed.position;
  const orbit = useMemo(() => {
    const rng = mulberry32(11);
    return Array.from({ length: 90 }, (_, i) => ({
      angle: (i / 90) * Math.PI * 2,
      r: 2.0 + rng() * 0.25,
      y: (rng() - 0.5) * 0.3,
      s: 0.02 + rng() * 0.03,
    }));
  }, []);
  return (
    <group position={[p.x, p.y, p.z]}>
      <Glow color={spec.brand.accent} scale={7.5} opacity={0.55} />
      <Glow color="#ffffff" scale={3.2} opacity={0.5} />
      <mesh>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <group rotation={[0.35, frame * 0.012, 0]}>
        {orbit.map((o, i) => (
          <mesh key={i} position={[Math.cos(o.angle) * o.r, o.y, Math.sin(o.angle) * o.r]}>
            <sphereGeometry args={[o.s, 6, 6]} />
            <meshBasicMaterial color={i % 5 === 0 ? spec.brand.accent : "#cfd3dc"} />
          </mesh>
        ))}
      </group>
      {stop.title ? (
        <T
          font={staticFile(FONT_BOLD)}
          fontSize={0.5}
          color={spec.brand.fg}
          anchorX="center"
          anchorY="top"
          position={[0, -1.85, 0]}
        >
          {stop.title}
        </T>
      ) : null}
      {stop.subtitle ? (
        <T
          font={staticFile(FONT_REG)}
          fontSize={0.2}
          color={spec.brand.accent}
          anchorX="center"
          anchorY="top"
          position={[0, -2.5, 0]}
          letterSpacing={0.28}
        >
          {stop.subtitle.toUpperCase()}
        </T>
      ) : null}
    </group>
  );
};

const FinalePanel: React.FC<{ src: string; angle: number; spec: Spec3D; frame: number }> = ({
  src,
  angle,
  spec,
  frame,
}) => {
  const tex = useImageTexture(staticFile(src));
  const r = 6.8;
  const a = angle + frame * 0.0014;
  const aspect = (tex.image as HTMLImageElement).width / (tex.image as HTMLImageElement).height;
  const h = 2.6;
  const w = Math.min(h * aspect, 4.2);
  return (
    <group
      position={[Math.cos(a) * r, Math.sin(a * 2) * 0.4, Math.sin(a) * r]}
      rotation={[0, -a + Math.PI / 2, 0]}
    >
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[w + 0.06, h + 0.06]} />
        <meshBasicMaterial color={spec.brand.accent} transparent opacity={0.7} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
};

const Finale: React.FC<{ placed: PlacedStop; spec: Spec3D; frame: number }> = ({
  placed,
  spec,
  frame,
}) => {
  if (placed.stop.kind !== "finale") return null;
  const { stop } = placed;
  const tex = useImageTexture(staticFile(stop.logoSrc));
  const p = placed.position;
  const vis = stopTextOpacity(placed, frame, spec.fps);
  return (
    <group position={[p.x, p.y, p.z]}>
      <Glow color={spec.brand.accent} scale={9} opacity={0.5} />
      <Glow color="#ffffff" scale={3.4} opacity={0.45} />
      <mesh>
        <planeGeometry args={[2.1, 2.1]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <T
        font={staticFile(FONT_BOLD)}
        fontSize={0.46}
        color={spec.brand.fg}
        anchorX="center"
        anchorY="top"
        position={[0, -1.6, 0]}
        fillOpacity={vis}
      >
        {stop.domain}
      </T>
      {stop.cta ? (
        <T
          font={staticFile(FONT_REG)}
          fontSize={0.2}
          color={spec.brand.accent}
          anchorX="center"
          anchorY="top"
          position={[0, -2.25, 0]}
          letterSpacing={0.26}
          fillOpacity={vis}
        >
          {stop.cta.toUpperCase()}
        </T>
      ) : null}
      {stop.panelSrcs.map((src, i) => (
        <FinalePanel
          key={src + i}
          src={src}
          angle={(i / stop.panelSrcs.length) * Math.PI * 2}
          spec={spec}
          frame={frame}
        />
      ))}
    </group>
  );
};

export const StopRenderer: React.FC<{ journey: Journey; spec: Spec3D; frame: number }> = ({
  journey,
  spec,
  frame,
}) => (
  <>
    {journey.placed.map((placed) => {
      switch (placed.stop.kind) {
        case "logo-emblem":
          return <LogoEmblem key={placed.index} placed={placed} spec={spec} frame={frame} />;
        case "site-monolith":
          return <Monolith key={placed.index} placed={placed} spec={spec} frame={frame} />;
        case "ring-tunnel":
          return <RingTunnel key={placed.index} placed={placed} spec={spec} frame={frame} />;
        case "review-field":
          return <ReviewField key={placed.index} placed={placed} spec={spec} frame={frame} />;
        case "text-moment":
          return <TextMoment key={placed.index} placed={placed} spec={spec} frame={frame} />;
        case "finale":
          return <Finale key={placed.index} placed={placed} spec={spec} frame={frame} />;
      }
    })}
  </>
);
