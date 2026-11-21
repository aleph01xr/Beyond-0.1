export interface CameraPoint {
  x: number;
  y: number;
}

export interface WorldViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export const MIN_CAMERA_ZOOM = 1.2;
export const MAX_CAMERA_ZOOM = 1.65;

/**
 * Computes an orientation-independent default camera zoom factor from the current
 * viewport dimensions in CSS pixels. Enlarges world characters, enemies, and NPCs
 * while keeping sufficient surrounding arena visibility on mobile, tablet, and desktop.
 */
export function computeCameraZoom(viewportWidth: number, viewportHeight: number): number {
  const safeW = Math.max(1, viewportWidth);
  const safeH = Math.max(1, viewportHeight);
  const shortSide = Math.min(safeW, safeH);
  const longSide = Math.max(safeW, safeH);

  const rawZoom = Math.min(longSide / 720, shortSide / 460);
  return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, rawZoom));
}

/**
 * Smoothly moves the camera center toward the target world position using
 * frame-rate-independent exponential damping, snapping immediately across
 * large teleports/map transitions.
 */
export function stepCameraFollow(
  camera: CameraPoint,
  targetX: number,
  targetY: number,
  dtSec: number,
  snapDistance: number = 480
): void {
  const dist = Math.hypot(targetX - camera.x, targetY - camera.y);
  if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y) || dist > snapDistance) {
    camera.x = targetX;
    camera.y = targetY;
    return;
  }
  const clampedDt = Math.max(0.001, Math.min(0.05, dtSec));
  const alpha = 1 - Math.exp(-14.5 * clampedDt);
  camera.x += (targetX - camera.x) * alpha;
  camera.y += (targetY - camera.y) * alpha;
}

/**
 * Converts a screen-space pointer coordinate into the player's world-space aim angle
 * accounting for active camera center and zoom level.
 */
export function computeWorldAimAngle(
  mouseScreenX: number,
  mouseScreenY: number,
  viewportWidth: number,
  viewportHeight: number,
  playerWorldX: number,
  playerWorldY: number,
  cameraWorldX: number,
  cameraWorldY: number,
  zoom: number
): number {
  const screenPlayerX = viewportWidth / 2 + (playerWorldX - cameraWorldX) * zoom;
  const screenPlayerY = viewportHeight / 2 + (playerWorldY - cameraWorldY) * zoom;
  return Math.atan2(mouseScreenY - screenPlayerY, mouseScreenX - screenPlayerX);
}

/**
 * Computes the visible world-space bounding rectangle centered on (cameraWorldX, cameraWorldY).
 */
export function getWorldViewBounds(
  cameraWorldX: number,
  cameraWorldY: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
): WorldViewBounds {
  const safeZoom = Math.max(0.1, zoom);
  const width = viewportWidth / safeZoom;
  const height = viewportHeight / safeZoom;
  return {
    left: cameraWorldX - width / 2,
    right: cameraWorldX + width / 2,
    top: cameraWorldY - height / 2,
    bottom: cameraWorldY + height / 2,
    width,
    height,
  };
}

/**
 * Aligns a world-space coordinate to the exact device pixel grid used by the zoomed camera
 * so sprites and floor tiles move in lockstep without sub-pixel phase jitter.
 */
export function snapToScreenPixel(worldCoord: number, zoom: number): number {
  const safeZoom = Math.max(0.1, zoom);
  return Math.round(worldCoord * safeZoom) / safeZoom;
}

export interface MapCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Computes the clamped source/destination rectangle for blitting only the visible slice
 * of the cached offscreen dungeon tile canvas.
 */
export function computeMapCropRect(
  worldView: WorldViewBounds,
  mapPixelWidth: number,
  mapPixelHeight: number,
  padPx = 2
): MapCropRect | null {
  if (mapPixelWidth <= 0 || mapPixelHeight <= 0) return null;
  const sx = Math.max(0, Math.floor(worldView.left - padPx));
  const sy = Math.max(0, Math.floor(worldView.top - padPx));
  const ex = Math.min(mapPixelWidth, Math.ceil(worldView.right + padPx));
  const ey = Math.min(mapPixelHeight, Math.ceil(worldView.bottom + padPx));
  const sw = ex - sx;
  const sh = ey - sy;
  if (sw <= 0 || sh <= 0) return null;
  return { sx, sy, sw, sh };
}

