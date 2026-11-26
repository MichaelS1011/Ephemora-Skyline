import * as THREE from "three";
import type { ForgeGraph } from "../contracts";
import { raycastGrid } from "./targeting";

export type PlayerView = "first" | "third";
export type PlayerLook = { yaw: number; pitch: number };

const THIRD_PERSON_DISTANCE = 4.8;
const THIRD_PERSON_ELEVATION = 0.34;
const AIM_DISTANCE = 2.4;
const AIM_HEIGHT = 0.45;
const CAMERA_CLEARANCE = 0.18;

const desiredPosition = new THREE.Vector3();
const boomDirection = new THREE.Vector3();

/** Horizontal avatar facing. Yaw zero faces the same -Z direction as the first-person camera. */
export function avatarForward(yaw: number, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/**
 * Keeps the camera behind and above the avatar while its crosshair points ahead.
 * The boom shortens in front of blocks instead of pushing the view through them.
 */
export function applyThirdPersonCamera(
  camera: THREE.Camera,
  player: THREE.Vector3,
  yaw: number,
  pitch: number,
  graph: ForgeGraph,
): void {
  const horizontalDistance = THIRD_PERSON_DISTANCE * Math.cos(THIRD_PERSON_ELEVATION);
  desiredPosition.set(
    player.x + Math.sin(yaw) * horizontalDistance,
    player.y + THIRD_PERSON_DISTANCE * Math.sin(THIRD_PERSON_ELEVATION),
    player.z + Math.cos(yaw) * horizontalDistance,
  );

  const boomLength = desiredPosition.distanceTo(player);
  boomDirection.copy(desiredPosition).sub(player).normalize();
  const obstruction = raycastGrid(graph, player, boomDirection, boomLength);
  if (obstruction) {
    const shortenedLength = Math.max(0, obstruction.distance - CAMERA_CLEARANCE);
    desiredPosition.copy(player).addScaledVector(boomDirection, shortenedLength);
  }

  camera.position.copy(desiredPosition);
  camera.lookAt(
    player.x - Math.sin(yaw) * AIM_DISTANCE,
    player.y + AIM_HEIGHT + Math.sin(pitch) * 3,
    player.z - Math.cos(yaw) * AIM_DISTANCE,
  );
}
