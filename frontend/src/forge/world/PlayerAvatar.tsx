import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PLAYER_EYE_HEIGHT } from "./targeting";
import type { PlayerLook, PlayerView } from "./playerCamera";

type PlayerAvatarProps = {
  view: PlayerView;
  playerPosition: RefObject<THREE.Vector3>;
  look: RefObject<PlayerLook>;
};

/** Seven plain boxes: readable at a glance, with no downloaded or external model. */
export function PlayerAvatar({ view, playerPosition, look }: PlayerAvatarProps) {
  const body = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const previousPosition = useRef(new THREE.Vector3());
  const phase = useRef(0);
  const strideBlend = useRef(0);

  useFrame((_, delta) => {
    if (!body.current) return;
    const player = playerPosition.current;
    const visible = view === "third";
    body.current.visible = visible;

    if (!visible) {
      previousPosition.current.copy(player);
      strideBlend.current = 0;
      leftArm.current!.rotation.x = 0;
      rightArm.current!.rotation.x = 0;
      leftLeg.current!.rotation.x = 0;
      rightLeg.current!.rotation.x = 0;
      return;
    }

    body.current.position.set(player.x, Math.max(0, player.y - PLAYER_EYE_HEIGHT), player.z);
    body.current.rotation.y = look.current.yaw;

    const travelled = Math.hypot(
      player.x - previousPosition.current.x,
      player.z - previousPosition.current.z,
    );
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reducedMotion) {
      strideBlend.current = 0;
    } else {
      if (travelled > 0.0001) phase.current = (phase.current + travelled * 6) % (Math.PI * 2);
      strideBlend.current = THREE.MathUtils.damp(
        strideBlend.current,
        travelled > 0.0001 ? 1 : 0,
        12,
        Math.min(delta, 0.05),
      );
    }

    const swing = Math.sin(phase.current) * 0.55 * strideBlend.current;
    leftArm.current!.rotation.x = swing;
    rightArm.current!.rotation.x = -swing;
    leftLeg.current!.rotation.x = -swing;
    rightLeg.current!.rotation.x = swing;
    previousPosition.current.copy(player);
  });

  return (
    <group
      ref={body}
      name={view === "third" ? "forge-player-avatar" : "forge-player-avatar-hidden"}
      visible={view === "third"}
    >
      <mesh name="player-torso" position={[0, 1.14, 0]} castShadow>
        <boxGeometry args={[0.64, 0.72, 0.34]} />
        <meshStandardMaterial color="#E8503C" roughness={0.82} />
      </mesh>
      <mesh name="player-head" position={[0, 1.72, 0]} castShadow>
        <boxGeometry args={[0.48, 0.48, 0.48]} />
        <meshStandardMaterial color="#E6B98D" roughness={0.82} />
      </mesh>
      <mesh name="player-hair" position={[0, 1.96, 0]} castShadow>
        <boxGeometry args={[0.5, 0.12, 0.5]} />
        <meshStandardMaterial color="#332A26" roughness={0.9} />
      </mesh>
      <group ref={leftArm} position={[-0.44, 1.44, 0]}>
        <mesh name="player-left-arm" position={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.2, 0.64, 0.24]} />
          <meshStandardMaterial color="#E8503C" roughness={0.82} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.44, 1.44, 0]}>
        <mesh name="player-right-arm" position={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.2, 0.64, 0.24]} />
          <meshStandardMaterial color="#E8503C" roughness={0.82} />
        </mesh>
      </group>
      <group ref={leftLeg} position={[-0.17, 0.78, 0]}>
        <mesh name="player-left-leg" position={[0, -0.39, 0]} castShadow>
          <boxGeometry args={[0.24, 0.78, 0.28]} />
          <meshStandardMaterial color="#162C4A" roughness={0.86} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.17, 0.78, 0]}>
        <mesh name="player-right-leg" position={[0, -0.39, 0]} castShadow>
          <boxGeometry args={[0.24, 0.78, 0.28]} />
          <meshStandardMaterial color="#162C4A" roughness={0.86} />
        </mesh>
      </group>
    </group>
  );
}
