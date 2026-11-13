import type { EnemyKind, HeroClassId, ProjectileState } from '../shared/types.ts';

export type ParticlePriority = 'low' | 'normal' | 'high' | 'critical';

export type ParticleShape =
  | 'square'
  | 'circle'
  | 'spark'
  | 'star'
  | 'diamond'
  | 'triangle'
  | 'shard'
  | 'ring'
  | 'crescent'
  | 'cross'
  | 'rune'
  | 'hexagon'
  | 'starburst'
  | 'streak'
  | 'smoke'
  | 'flame';

export interface CombatParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  secondaryColor?: string;
  size: number;
  bornAt: number;
  maxAgeMs: number;
  gravity?: number;
  friction?: number;
  shape?: ParticleShape;
  glow?: boolean;
  glowBlur?: number;

  // Transforms & Scale Dynamics
  rotation?: number;
  angularVelocity?: number;
  startScale?: number;
  endScale?: number;
  scaleCurve?: 'linear' | 'easeIn' | 'easeOut' | 'pulse';

  // Physics & Advanced Trajectories
  ax?: number;
  ay?: number;
  drag?: number;
  curveDrift?: number;
  wander?: number;

  // Wave, Orbit & Inward Attraction
  waveAmplitude?: number;
  waveFrequency?: number;
  wavePhase?: number;
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitAngle?: number;
  orbitEccentricity?: number;
  attractX?: number;
  attractY?: number;
  attractStrength?: number;
  attractMinDist?: number;
  attractSpiralBias?: number;
  spiralSpeed?: number;
  spiralRadius?: number;
  spiralRadialVelocity?: number;
  spiralTangentialVelocity?: number;

  // Expanding & Contracting Ring
  ringRadius?: number;
  ringMaxRadius?: number;
  ringLineWidth?: number;

  // Visual Styling & Lifetimes
  colorEnd?: string;
  alphaStart?: number;
  alphaEnd?: number;
  fadeInRatio?: number;
  alphaCurve?: 'linear' | 'easeIn' | 'easeOut' | 'pulse';
  blendMode?: GlobalCompositeOperation;
  priority?: ParticlePriority;
  stretchWithVelocity?: boolean;
  stretchFactor?: number;
  pulseRate?: number;
  flicker?: boolean;
}

export interface ScreenShakeState {
  intensity: number;
  maxIntensity: number;
}

export interface ParticleBudgetConfig {
  maxParticles: number;
  reserveForCritical: number;
  reserveForHigh: number;
}

export const DEFAULT_PARTICLE_BUDGET: ParticleBudgetConfig = {
  maxParticles: 500,
  reserveForCritical: 150,
  reserveForHigh: 80,
};

// Fast hex/color parsing & interpolation helper without per-frame allocations
interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const colorCache = new Map<string, RgbColor>();

function parseRgb(colorStr: string): RgbColor {
  const cached = colorCache.get(colorStr);
  if (cached) return cached;

  let r = 255;
  let g = 255;
  let b = 255;

  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) || 255;
      g = parseInt(hex[1] + hex[1], 16) || 255;
      b = parseInt(hex[2] + hex[2], 16) || 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16) || 255;
      g = parseInt(hex.slice(2, 4), 16) || 255;
      b = parseInt(hex.slice(4, 6), 16) || 255;
    }
  } else if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      r = parseInt(match[1], 10);
      g = parseInt(match[2], 10);
      b = parseInt(match[3], 10);
    }
  }

  const res: RgbColor = { r, g, b };
  if (colorCache.size < 120) {
    colorCache.set(colorStr, res);
  }
  return res;
}

function interpolateColorRgb(c1: RgbColor, c2: RgbColor, t: number): string {
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r},${g},${b})`;
}

// =========================================================================
// REUSABLE MOVEMENT FUNCTIONS: SPIRAL, ORBIT & INWARD ATTRACTION
// =========================================================================

export interface SpiralMovementOptions {
  speed?: number;
  radialVelocity?: number;
  tangentialVelocity?: number;
  decayRate?: number;
}

/**
 * Applies logarithmic/Archimedean spiral movement to a particle based on its age
 * and velocity dynamics, modulating trajectory tangentially and radially.
 */
export function applySpiralMovement(
  p: CombatParticle,
  dtSec: number,
  ageMs: number,
  options?: SpiralMovementOptions
): void {
  const speed = options?.speed ?? p.spiralSpeed ?? 2.0;
  const tanVel = options?.tangentialVelocity ?? p.spiralTangentialVelocity ?? 50;
  const radialVel = options?.radialVelocity ?? p.spiralRadialVelocity ?? 0;
  const decay = options?.decayRate ?? 1.0;

  const angle = (p.bornAt * 0.005) + (ageMs * 0.006 * speed);
  const factor = Math.max(0.2, decay);

  // Tangential velocity component creates the swirling curvature
  p.vx += Math.cos(angle) * tanVel * factor * dtSec;
  p.vy += Math.sin(angle) * tanVel * factor * dtSec;

  // Optional radial component pushes outward or pulls inward
  if (radialVel !== 0) {
    p.vx += Math.sin(angle) * radialVel * dtSec;
    p.vy -= Math.cos(angle) * radialVel * dtSec;
  }
}

export interface OrbitMovementOptions {
  centerX?: number;
  centerY?: number;
  radius?: number;
  speed?: number;
  eccentricity?: number;
}

/**
 * Locks a particle into an orbital revolution around a specified center coordinate
 * with configurable angular speed, orbital radius, and horizontal/vertical eccentricity.
 */
export function applyOrbitMovement(
  p: CombatParticle,
  dtSec: number,
  options?: OrbitMovementOptions
): void {
  const cx = options?.centerX ?? p.orbitCenterX;
  const cy = options?.centerY ?? p.orbitCenterY;
  if (cx === undefined || cy === undefined) return;

  const speed = options?.speed ?? p.orbitSpeed ?? 3.0;
  const radius = options?.radius ?? p.orbitRadius ?? 24;
  const eccentricity = options?.eccentricity ?? p.orbitEccentricity ?? 1.0;

  p.orbitAngle = (p.orbitAngle ?? 0) + speed * dtSec;
  p.x = cx + Math.cos(p.orbitAngle) * radius;
  p.y = cy + Math.sin(p.orbitAngle) * radius * eccentricity;
}

export interface InwardAttractionOptions {
  targetX?: number;
  targetY?: number;
  strength?: number;
  minDistance?: number;
  maxDistance?: number;
  spiralBias?: number;
}

/**
 * Pulls a particle inward toward an attractor coordinate with gravitational scaling
 * and optional tangential spiral swirl bias.
 */
export function applyInwardAttraction(
  p: CombatParticle,
  dtSec: number,
  options?: InwardAttractionOptions
): void {
  const tx = options?.targetX ?? p.attractX;
  const ty = options?.targetY ?? p.attractY;
  if (tx === undefined || ty === undefined) return;

  const strength = options?.strength ?? p.attractStrength ?? 160;
  const minDist = options?.minDistance ?? p.attractMinDist ?? 4;
  const maxDist = options?.maxDistance ?? 450;
  const spiralBias = options?.spiralBias ?? p.attractSpiralBias ?? 0;

  const dx = tx - p.x;
  const dy = ty - p.y;
  const dist = Math.hypot(dx, dy);

  if (dist > minDist && dist < maxDist) {
    const normX = dx / dist;
    const normY = dy / dist;
    const force = strength * dtSec;

    // Linear gravitational attraction
    p.vx += normX * force;
    p.vy += normY * force;

    // Swirling vortex bias creates an inward spiraling vortex
    if (spiralBias !== 0) {
      p.vx += -normY * force * spiralBias;
      p.vy += normX * force * spiralBias;
    }
  }
}

/**
 * Composite movement orchestrator updating particle positions and velocities
 * by evaluating inward attraction, spiral drift, and orbit revolution.
 */
export function applyParticleMovement(
  p: CombatParticle,
  dtSec: number,
  ageMs: number
): void {
  // 1. Inward Attraction
  if (p.attractX !== undefined && p.attractY !== undefined && p.attractStrength) {
    applyInwardAttraction(p, dtSec);
  }

  // 2. Spiral Motion
  if (p.spiralSpeed) {
    applySpiralMovement(p, dtSec, ageMs);
  }

  // 3. Orbit Revolution vs Standard Linear Translation
  if (p.orbitCenterX !== undefined && p.orbitCenterY !== undefined && p.orbitSpeed) {
    applyOrbitMovement(p, dtSec);
  } else {
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
  }
}

// =========================================================================
// REUSABLE PROCEDURAL PARTICLE SHAPE DRAWING FUNCTIONS
// =========================================================================

export function drawDiamondShape(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(Math.round(s * 0.75), 0);
  ctx.lineTo(0, s);
  ctx.lineTo(-Math.round(s * 0.75), 0);
  ctx.closePath();
  ctx.fill();
}

export function drawTriangleShape(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(s, 0);
  ctx.lineTo(-Math.round(s * 0.6), -Math.round(s * 0.5));
  ctx.lineTo(-Math.round(s * 0.6), Math.round(s * 0.5));
  ctx.closePath();
  ctx.fill();
}

export function drawShardShape(
  ctx: CanvasRenderingContext2D,
  s: number,
  secondaryColor?: string
): void {
  ctx.beginPath();
  ctx.moveTo(0, -Math.round(s * 1.3));
  ctx.lineTo(Math.round(s * 0.6), -Math.round(s * 0.2));
  ctx.lineTo(Math.round(s * 0.3), Math.round(s * 1.1));
  ctx.lineTo(-Math.round(s * 0.4), Math.round(s * 0.8));
  ctx.lineTo(-Math.round(s * 0.5), -Math.round(s * 0.3));
  ctx.closePath();
  ctx.fill();
  if (secondaryColor) {
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -Math.round(s * 1.1));
    ctx.lineTo(Math.round(s * 0.2), Math.round(s * 0.8));
    ctx.stroke();
  }
}

export function drawRingShape(
  ctx: CanvasRenderingContext2D,
  radius: number,
  drawColor: string,
  lineWidth?: number
): void {
  ctx.strokeStyle = drawColor;
  ctx.lineWidth = lineWidth || 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawCrescentShape(ctx: CanvasRenderingContext2D, s: number): void {
  const cr = Math.max(2, s);
  ctx.beginPath();
  ctx.arc(0, 0, cr, -0.9, 0.9, false);
  ctx.arc(Math.round(cr * 0.3), 0, Math.max(1, Math.round(cr * 0.75)), 0.9, -0.9, true);
  ctx.closePath();
  ctx.fill();
}

export function drawCrossShape(
  ctx: CanvasRenderingContext2D,
  s: number,
  secondaryColor?: string
): void {
  ctx.fillRect(-0.5, -Math.round(s * 1.3), 1.5, Math.round(s * 2.6));
  ctx.fillRect(-Math.round(s * 0.8), -0.5, Math.round(s * 1.6), 1.5);
  ctx.fillStyle = secondaryColor || '#FFFFFF';
  ctx.fillRect(-1, -1, 2, 2);
}

export function drawRuneShape(
  ctx: CanvasRenderingContext2D,
  s: number,
  bornAt: number
): void {
  const variant = Math.floor(Math.abs(bornAt)) % 3;
  ctx.lineWidth = 1;
  if (variant === 0) {
    // Occult Eye glyph
    ctx.strokeRect(-Math.round(s * 0.5), -Math.round(s * 0.5), s, s);
    ctx.fillRect(-Math.round(s * 0.7), 0, Math.round(s * 1.4), 1);
    ctx.fillRect(-0.5, -0.5, 1.5, 1.5);
  } else if (variant === 1) {
    // Arcane Trident glyph
    ctx.fillRect(-0.5, -s, 1.5, s * 2);
    ctx.fillRect(-Math.round(s * 0.6), -Math.round(s * 0.5), Math.round(s * 1.2), 1);
    ctx.fillRect(-Math.round(s * 0.6), -s, 1, Math.round(s * 0.5));
    ctx.fillRect(Math.round(s * 0.6), -s, 1, Math.round(s * 0.5));
  } else {
    // Delta Ward glyph
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(Math.round(s * 0.7), Math.round(s * 0.7));
    ctx.lineTo(-Math.round(s * 0.7), Math.round(s * 0.7));
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(-Math.round(s * 0.4), 0, Math.round(s * 0.8), 1);
  }
}

export function drawHexagonShape(
  ctx: CanvasRenderingContext2D,
  s: number,
  secondaryColor?: string
): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const ha = (k * Math.PI) / 3;
    const hx = Math.round(Math.cos(ha) * s);
    const hy = Math.round(Math.sin(ha) * s);
    if (k === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.fill();
  if (secondaryColor) {
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawStarburstShape(
  ctx: CanvasRenderingContext2D,
  s: number,
  secondaryColor?: string
): void {
  // Cardinal beams
  ctx.fillRect(-Math.round(s * 1.8), -0.5, Math.round(s * 3.6), 1.2);
  ctx.fillRect(-0.5, -Math.round(s * 1.8), 1.2, Math.round(s * 3.6));
  // Diagonal beams
  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-Math.round(s * 1.0), -0.5, Math.round(s * 2.0), 1.2);
  ctx.fillRect(-0.5, -Math.round(s * 1.0), 1.2, Math.round(s * 2.0));
  ctx.restore();
  // Center core
  ctx.fillStyle = secondaryColor || '#FFFFFF';
  ctx.fillRect(-1, -1, 3, 3);
}

export function drawStreakShape(ctx: CanvasRenderingContext2D, curSize: number): void {
  const len = Math.max(3, Math.round(curSize * 2.5));
  ctx.fillRect(-len, -0.5, len * 2, 1.4);
}

export function drawSmokeShape(ctx: CanvasRenderingContext2D, curSize: number): void {
  const r = Math.max(1, Math.round(curSize * 0.7));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.arc(-Math.round(r * 0.45), -Math.round(r * 0.35), Math.round(r * 0.75), 0, Math.PI * 2);
  ctx.arc(Math.round(r * 0.4), -Math.round(r * 0.4), Math.round(r * 0.65), 0, Math.PI * 2);
  ctx.fill();
}

export function drawFlameShape(
  ctx: CanvasRenderingContext2D,
  s: number,
  now: number,
  bornAt: number,
  secondaryColor?: string
): void {
  const flickerY = Math.sin(now * 0.03 + bornAt) * (s * 0.25);
  ctx.beginPath();
  ctx.moveTo(-Math.round(s * 0.6), Math.round(s * 0.6));
  ctx.quadraticCurveTo(-Math.round(s * 0.7), -Math.round(s * 0.4), 0, -Math.round(s * 1.3) + flickerY);
  ctx.quadraticCurveTo(Math.round(s * 0.7), -Math.round(s * 0.4), Math.round(s * 0.6), Math.round(s * 0.6));
  ctx.closePath();
  ctx.fill();
  // Inner hot core
  ctx.fillStyle = secondaryColor || '#FEF08A';
  ctx.beginPath();
  ctx.moveTo(-Math.round(s * 0.3), Math.round(s * 0.5));
  ctx.quadraticCurveTo(-Math.round(s * 0.35), 0, 0, -Math.round(s * 0.7) + flickerY * 0.5);
  ctx.quadraticCurveTo(Math.round(s * 0.35), 0, Math.round(s * 0.3), Math.round(s * 0.5));
  ctx.closePath();
  ctx.fill();
}

/**
 * Procedurally draws pixel-art shapes on Canvas with sub-pixel precision,
 * custom strokes, secondary accents, and life-cycle scaling.
 */
export function drawParticleShape(
  ctx: CanvasRenderingContext2D,
  shape: ParticleShape,
  curSize: number,
  drawColor: string,
  p: CombatParticle,
  now: number
): void {
  const s = Math.max(1, Math.round(curSize));

  switch (shape) {
    case 'square':
      ctx.fillRect(-Math.floor(s / 2), -Math.floor(s / 2), s, s);
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, curSize), 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'spark':
      ctx.fillRect(-s, -0.5, s * 2, 1.2);
      break;
    case 'star':
      ctx.fillRect(-s, 0, s * 2, 1);
      ctx.fillRect(0, -s, 1, s * 2);
      break;
    case 'diamond':
      drawDiamondShape(ctx, s);
      break;
    case 'triangle':
      drawTriangleShape(ctx, s);
      break;
    case 'shard':
      drawShardShape(ctx, s, p.secondaryColor);
      break;
    case 'ring': {
      const r = Math.max(1, Math.round(p.ringRadius !== undefined ? p.ringRadius : curSize));
      drawRingShape(ctx, r, drawColor, p.ringLineWidth);
      break;
    }
    case 'crescent':
      drawCrescentShape(ctx, s);
      break;
    case 'cross':
      drawCrossShape(ctx, s, p.secondaryColor);
      break;
    case 'rune':
      drawRuneShape(ctx, s, p.bornAt);
      break;
    case 'hexagon':
      drawHexagonShape(ctx, s, p.secondaryColor);
      break;
    case 'starburst':
      drawStarburstShape(ctx, s, p.secondaryColor);
      break;
    case 'streak':
      drawStreakShape(ctx, curSize);
      break;
    case 'smoke':
      drawSmokeShape(ctx, curSize);
      break;
    case 'flame':
      drawFlameShape(ctx, s, now, p.bornAt, p.secondaryColor);
      break;
    default:
      ctx.fillRect(-Math.floor(s / 2), -Math.floor(s / 2), s, s);
      break;
  }
}

/**
 * Creates and updates combat particles with object pooling, priority budgets,
 * smooth animation curves, and high performance canvas rendering.
 */
export class ParticleManager {
  private particles: CombatParticle[] = [];
  private pool: CombatParticle[] = [];
  private budget: ParticleBudgetConfig;
  private projectileLastSpawn = new Map<string, number>();

  constructor(budgetConfig: Partial<ParticleBudgetConfig> = {}) {
    this.budget = {
      ...DEFAULT_PARTICLE_BUDGET,
      ...budgetConfig,
    };
  }

  public get count(): number {
    return this.particles.length;
  }

  public get poolSize(): number {
    return this.pool.length;
  }

  public setBudget(newBudget: Partial<ParticleBudgetConfig>): void {
    this.budget = { ...this.budget, ...newBudget };
  }

  public clear(): void {
    while (this.particles.length > 0) {
      const p = this.particles.pop();
      if (p) this.recycleParticle(p);
    }
    this.projectileLastSpawn.clear();
  }

  private recycleParticle(p: CombatParticle): void {
    if (this.pool.length < this.budget.maxParticles + 100) {
      this.pool.push(p);
    }
  }

  /**
   * Acquire a particle from the pool or allocate one, respecting priority budgets.
   * If budget is exceeded, skips lower priority particles or reclaims the oldest low-priority particle.
   */
  private acquireParticle(props: CombatParticle): boolean {
    const priority = props.priority || 'normal';
    const currentCount = this.particles.length;
    const max = this.budget.maxParticles;

    // Check budget availability based on priority
    if (priority === 'low' && currentCount >= max - this.budget.reserveForHigh) {
      return false;
    }
    if (priority === 'normal' && currentCount >= max - this.budget.reserveForCritical) {
      // Try to reclaim an expired or oldest low-priority particle
      let reclaimed = false;
      for (let i = 0; i < currentCount; i++) {
        if (this.particles[i].priority === 'low') {
          const removed = this.particles.splice(i, 1)[0];
          this.recycleParticle(removed);
          reclaimed = true;
          break;
        }
      }
      if (!reclaimed && currentCount >= max - this.budget.reserveForCritical) {
        return false;
      }
    }
    if (priority === 'high' && currentCount >= max) {
      // Reclaim low or normal priority particle
      for (let i = 0; i < currentCount; i++) {
        const pPrio = this.particles[i].priority;
        if (pPrio === 'low' || pPrio === 'normal') {
          const removed = this.particles.splice(i, 1)[0];
          this.recycleParticle(removed);
          break;
        }
      }
      if (this.particles.length >= max) {
        return false;
      }
    }
    if (priority === 'critical' && currentCount >= max + 50) {
      // Reclaim any non-critical particle
      for (let i = 0; i < currentCount; i++) {
        if (this.particles[i].priority !== 'critical') {
          const removed = this.particles.splice(i, 1)[0];
          this.recycleParticle(removed);
          break;
        }
      }
    }

    let p = this.pool.pop();
    if (!p) {
      p = { ...props };
    } else {
      p.x = props.x;
      p.y = props.y;
      p.vx = props.vx;
      p.vy = props.vy;
      p.color = props.color;
      p.secondaryColor = props.secondaryColor;
      p.size = props.size;
      p.bornAt = props.bornAt;
      p.maxAgeMs = props.maxAgeMs;
      p.gravity = props.gravity;
      p.friction = props.friction;
      p.shape = props.shape;
      p.glow = props.glow;
      p.glowBlur = props.glowBlur;

      p.rotation = props.rotation;
      p.angularVelocity = props.angularVelocity;
      p.startScale = props.startScale;
      p.endScale = props.endScale;
      p.scaleCurve = props.scaleCurve;

      p.ax = props.ax;
      p.ay = props.ay;
      p.drag = props.drag;
      p.curveDrift = props.curveDrift;
      p.wander = props.wander;

      p.waveAmplitude = props.waveAmplitude;
      p.waveFrequency = props.waveFrequency;
      p.wavePhase = props.wavePhase;
      p.orbitCenterX = props.orbitCenterX;
      p.orbitCenterY = props.orbitCenterY;
      p.orbitRadius = props.orbitRadius;
      p.orbitSpeed = props.orbitSpeed;
      p.orbitAngle = props.orbitAngle;
      p.orbitEccentricity = props.orbitEccentricity;
      p.attractX = props.attractX;
      p.attractY = props.attractY;
      p.attractStrength = props.attractStrength;
      p.attractMinDist = props.attractMinDist;
      p.attractSpiralBias = props.attractSpiralBias;
      p.spiralSpeed = props.spiralSpeed;
      p.spiralRadius = props.spiralRadius;
      p.spiralRadialVelocity = props.spiralRadialVelocity;
      p.spiralTangentialVelocity = props.spiralTangentialVelocity;

      p.ringRadius = props.ringRadius;
      p.ringMaxRadius = props.ringMaxRadius;
      p.ringLineWidth = props.ringLineWidth;

      p.colorEnd = props.colorEnd;
      p.alphaStart = props.alphaStart;
      p.alphaEnd = props.alphaEnd;
      p.fadeInRatio = props.fadeInRatio;
      p.alphaCurve = props.alphaCurve;
      p.blendMode = props.blendMode;
      p.priority = props.priority;
      p.stretchWithVelocity = props.stretchWithVelocity;
      p.stretchFactor = props.stretchFactor;
      p.pulseRate = props.pulseRate;
      p.flicker = props.flicker;
    }

    this.particles.push(p);
    return true;
  }

  /**
   * Applies logarithmic/Archimedean spiral movement to a particle based on its age
   * and velocity dynamics, modulating trajectory tangentially and radially.
   */
  public applySpiralMovement(
    p: CombatParticle,
    dtSec: number,
    ageMs: number,
    options?: SpiralMovementOptions
  ): void {
    applySpiralMovement(p, dtSec, ageMs, options);
  }

  /**
   * Locks a particle into an orbital revolution around a specified center coordinate
   * with configurable angular speed, orbital radius, and horizontal/vertical eccentricity.
   */
  public applyOrbitMovement(
    p: CombatParticle,
    dtSec: number,
    options?: OrbitMovementOptions
  ): void {
    applyOrbitMovement(p, dtSec, options);
  }

  /**
   * Pulls a particle inward toward an attractor coordinate with gravitational scaling
   * and optional tangential spiral swirl bias.
   */
  public applyInwardAttraction(
    p: CombatParticle,
    dtSec: number,
    options?: InwardAttractionOptions
  ): void {
    applyInwardAttraction(p, dtSec, options);
  }

  /**
   * Composite movement orchestrator updating particle positions and velocities
   * by evaluating inward attraction, spiral drift, and orbit revolution.
   */
  public applyParticleMovement(
    p: CombatParticle,
    dtSec: number,
    ageMs: number
  ): void {
    applyParticleMovement(p, dtSec, ageMs);
  }

  /**
   * Procedurally draws pixel-art shapes on Canvas with sub-pixel precision,
   * custom strokes, secondary accents, and life-cycle scaling.
   */
  public drawParticleShape(
    ctx: CanvasRenderingContext2D,
    shape: ParticleShape,
    curSize: number,
    drawColor: string,
    p: CombatParticle,
    now: number = performance.now()
  ): void {
    drawParticleShape(ctx, shape, curSize, drawColor, p, now);
  }

  public spawnHitSparks(
    x: number,
    y: number,
    color: string,
    count: number = 8,
    now: number = performance.now(),
    isCrit: boolean = false
  ): void {
    const sparkCount = isCrit ? count * 2 : count;
    const priority: ParticlePriority = isCrit ? 'critical' : 'high';

    if (isCrit) {
      // Impact starburst flash at hit point
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#FFFFFF',
        secondaryColor: '#FEF08A',
        size: 4,
        bornAt: now,
        maxAgeMs: 200,
        shape: 'starburst',
        glow: true,
        glowBlur: 6,
        priority: 'critical',
      });

      // Small kinetic impact ring
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#FDE047',
        size: 3,
        ringRadius: 2,
        ringMaxRadius: 18,
        ringLineWidth: 1.5,
        bornAt: now,
        maxAgeMs: 180,
        shape: 'ring',
        glow: true,
        priority: 'critical',
      });
    }

    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (isCrit ? 110 : 65) + Math.random() * (isCrit ? 180 : 110);
      const shape: ParticleShape = isCrit
        ? (i % 3 === 0 ? 'cross' : i % 3 === 1 ? 'streak' : 'diamond')
        : (i % 2 === 0 ? 'spark' : 'triangle');

      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: isCrit ? '#FEF08A' : color,
        secondaryColor: isCrit ? '#F59E0B' : '#FFFFFF',
        colorEnd: isCrit ? '#EA580C' : undefined,
        size: isCrit ? 2.5 + Math.random() * 2 : 1.5 + Math.random() * 1.5,
        startScale: 1.2,
        endScale: 0.3,
        bornAt: now,
        maxAgeMs: (isCrit ? 450 : 300) + Math.random() * 200,
        gravity: 120,
        friction: 0.92,
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 12,
        stretchWithVelocity: isCrit && shape === 'streak',
        stretchFactor: 0.006,
        shape,
        glow: isCrit,
        glowBlur: isCrit ? 5 : 0,
        priority,
      });
    }
  }

  public spawnEnemyDeathBurst(
    x: number,
    y: number,
    kind: EnemyKind,
    now: number = performance.now()
  ): void {
    let baseColor = '#4ADE80';
    let secondaryColor = '#86EFAC';
    let particleCount = 18;
    const isBoss = kind === 'boss';
    const priority: ParticlePriority = isBoss ? 'critical' : 'high';

    if (isBoss) {
      // Catastrophic boss death shockwave ring & starburst
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#FDE047',
        size: 5,
        ringRadius: 4,
        ringMaxRadius: 56,
        ringLineWidth: 3,
        bornAt: now,
        maxAgeMs: 450,
        shape: 'ring',
        glow: true,
        glowBlur: 8,
        priority: 'critical',
      });

      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#FFFFFF',
        secondaryColor: '#EF4444',
        size: 7,
        bornAt: now,
        maxAgeMs: 320,
        shape: 'starburst',
        glow: true,
        glowBlur: 8,
        priority: 'critical',
      });
    }

    if (kind === 'slime') {
      baseColor = '#22C55E';
      secondaryColor = '#86EFAC';
      particleCount = 20;
    } else if (kind === 'goblin') {
      baseColor = '#65A30D';
      secondaryColor = '#CA8A04';
      particleCount = 18;
    } else if (kind === 'skeleton') {
      baseColor = '#E2E8F0';
      secondaryColor = '#38BDF8';
      particleCount = 22;
    } else if (kind === 'cultist') {
      baseColor = '#7E22CE';
      secondaryColor = '#C084FC';
      particleCount = 24;
    } else if (kind === 'knight') {
      baseColor = '#64748B';
      secondaryColor = '#F59E0B';
      particleCount = 26;
    } else if (kind === 'boss') {
      baseColor = '#EF4444';
      secondaryColor = '#FDE047';
      particleCount = 48;
    }

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * (isBoss ? 240 : 150);

      let shape: ParticleShape = 'square';
      if (kind === 'slime') {
        shape = i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'smoke' : 'ring';
      } else if (kind === 'goblin') {
        shape = i % 3 === 0 ? 'triangle' : i % 3 === 1 ? 'flame' : 'spark';
      } else if (kind === 'skeleton') {
        shape = i % 3 === 0 ? 'shard' : i % 3 === 1 ? 'diamond' : 'spark';
      } else if (kind === 'cultist') {
        shape = i % 3 === 0 ? 'rune' : i % 3 === 1 ? 'crescent' : 'starburst';
      } else if (kind === 'knight') {
        shape = i % 3 === 0 ? 'hexagon' : i % 3 === 1 ? 'triangle' : 'streak';
      } else if (kind === 'boss') {
        shape = i % 4 === 0 ? 'flame' : i % 4 === 1 ? 'starburst' : i % 4 === 2 ? 'rune' : 'streak';
      }

      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 25,
        color: i % 2 === 0 ? baseColor : secondaryColor,
        secondaryColor: '#FFFFFF',
        colorEnd: isBoss ? '#991B1B' : kind === 'slime' ? '#064E3B' : undefined,
        size: 2 + Math.random() * 2.5,
        startScale: 1.0,
        endScale: 0.2,
        bornAt: now,
        maxAgeMs: 400 + Math.random() * 350,
        gravity: kind === 'slime' ? 80 : 160,
        friction: 0.91,
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 8,
        shape,
        glow: isBoss || kind === 'cultist',
        priority,
      });
    }
  }

  public spawnPortalWisps(
    px: number,
    py: number,
    active: boolean,
    now: number
  ): void {
    if (Math.random() < (active ? 0.45 : 0.15)) {
      const angle = Math.random() * Math.PI * 2;
      const dist = active ? 22 + Math.random() * 26 : 18 + Math.random() * 12;
      const isOrbiting = active && Math.random() > 0.5;

      if (isOrbiting) {
        // Orbiting portal wisp circling the gate threshold
        this.acquireParticle({
          x: px + Math.cos(angle) * dist,
          y: py + Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          color: Math.random() > 0.5 ? '#38BDF8' : '#818CF8',
          secondaryColor: '#E0F2FE',
          size: 2.2 + Math.random() * 1.4,
          startScale: 0.8,
          endScale: 1.2,
          bornAt: now,
          maxAgeMs: 650,
          orbitCenterX: px,
          orbitCenterY: py,
          orbitRadius: dist,
          orbitSpeed: 3.4 * (Math.random() > 0.5 ? 1 : -1),
          orbitAngle: angle,
          shape: Math.random() > 0.4 ? 'rune' : 'diamond',
          glow: true,
          priority: 'normal',
        });
      } else {
        // Inward spiraling portal wisp drawn toward the rift core
        this.acquireParticle({
          x: px + Math.cos(angle) * dist,
          y: py + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * (active ? 30 : 10),
          vy: -Math.sin(angle) * (active ? 30 : 10),
          color: active ? (Math.random() > 0.5 ? '#38BDF8' : '#818CF8') : '#475569',
          secondaryColor: active ? '#E0F2FE' : '#1E293B',
          size: active ? 2.0 + Math.random() * 1.6 : 1.2,
          startScale: 0.8,
          endScale: 1.2,
          bornAt: now,
          maxAgeMs: active ? 650 : 450,
          friction: 0.95,
          attractX: px,
          attractY: py,
          attractStrength: active ? 140 : 40,
          attractSpiralBias: active ? 0.4 : 0,
          spiralSpeed: active ? 2.2 : 0,
          rotation: Math.random() * Math.PI * 2,
          angularVelocity: active ? 4 : 0,
          shape: active ? (Math.random() > 0.4 ? 'rune' : 'diamond') : 'circle',
          glow: active,
          priority: active ? 'normal' : 'low',
        });
      }
    }
  }

  public spawnShrineMotes(sx: number, sy: number, active: boolean, now: number): void {
    if (active && Math.random() < 0.3) {
      this.acquireParticle({
        x: sx + (Math.random() - 0.5) * 20,
        y: sy - 14 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -25 - Math.random() * 20,
        color: Math.random() > 0.4 ? '#34D399' : '#FDE047',
        secondaryColor: '#A7F3D0',
        size: 1.8 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 700 + Math.random() * 300,
        friction: 0.97,
        wander: 8,
        fadeInRatio: 0.2,
        shape: Math.random() > 0.5 ? 'cross' : 'diamond',
        glow: true,
        priority: 'low',
      });
    }
  }

  public spawnBossShieldSparks(bx: number, by: number, now: number): void {
    if (Math.random() < 0.45) {
      const angle = Math.random() * Math.PI * 2;
      const isOrbiting = Math.random() > 0.35;
      this.acquireParticle({
        x: bx + Math.cos(angle) * 32,
        y: by + Math.sin(angle) * 32,
        vx: isOrbiting ? 0 : Math.cos(angle) * 45 + (Math.random() - 0.5) * 20,
        vy: isOrbiting ? 0 : Math.sin(angle) * 45 - 20,
        color: Math.random() > 0.5 ? '#60A5FA' : '#93C5FD',
        secondaryColor: '#FFFFFF',
        size: 2.2 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 380 + Math.random() * 200,
        friction: 0.92,
        orbitCenterX: isOrbiting ? bx : undefined,
        orbitCenterY: isOrbiting ? by : undefined,
        orbitRadius: 32 + Math.random() * 6,
        orbitSpeed: 4.2 * (Math.random() > 0.5 ? 1 : -1),
        orbitAngle: angle,
        rotation: angle,
        shape: Math.random() > 0.5 ? 'hexagon' : 'spark',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnFrostNovaMotes(fx: number, fy: number, radius: number, now: number): void {
    if (Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const isOrbit = Math.random() > 0.5;
      this.acquireParticle({
        x: fx + Math.cos(a) * r,
        y: fy + Math.sin(a) * r,
        vx: isOrbit ? 0 : (Math.random() - 0.5) * 15,
        vy: isOrbit ? 0 : -25 - Math.random() * 25,
        color: Math.random() > 0.5 ? '#38BDF8' : '#BAE6FD',
        secondaryColor: '#E0F2FE',
        size: 1.8 + Math.random() * 1.6,
        bornAt: now,
        maxAgeMs: 500 + Math.random() * 250,
        friction: 0.95,
        orbitCenterX: isOrbit ? fx : undefined,
        orbitCenterY: isOrbit ? fy : undefined,
        orbitRadius: r,
        orbitSpeed: 2.6 * (Math.random() > 0.5 ? 1 : -1),
        orbitAngle: a,
        spiralSpeed: isOrbit ? 0 : 2.0,
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: 6,
        shape: Math.random() > 0.5 ? 'shard' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnMagmaEmbers(mx: number, my: number, radius: number, now: number): void {
    if (Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;
      this.acquireParticle({
        x: mx + Math.cos(a) * r,
        y: my + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 20,
        vy: -35 - Math.random() * 35,
        color: Math.random() > 0.5 ? '#F97316' : '#EF4444',
        secondaryColor: '#FEF08A',
        colorEnd: '#7F1D1D',
        size: 2.2 + Math.random() * 1.8,
        bornAt: now,
        maxAgeMs: 550 + Math.random() * 300,
        gravity: -20,
        friction: 0.94,
        shape: Math.random() > 0.4 ? 'flame' : 'smoke',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnSingularityInwardWisps(sx: number, sy: number, radius: number, now: number): void {
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      const dist = radius + 20 + Math.random() * 30;
      this.acquireParticle({
        x: sx + Math.cos(a) * dist,
        y: sy + Math.sin(a) * dist,
        vx: -Math.cos(a) * 40,
        vy: -Math.sin(a) * 40,
        color: Math.random() > 0.5 ? '#C084FC' : '#E879F9',
        secondaryColor: '#581C87',
        size: 2.4 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 500 + Math.random() * 200,
        attractX: sx,
        attractY: sy,
        attractStrength: 190,
        attractSpiralBias: 0.45,
        spiralSpeed: 2.4,
        friction: 0.95,
        rotation: a,
        angularVelocity: 8,
        shape: Math.random() > 0.4 ? 'crescent' : 'rune',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnSupernovaGlints(sx: number, sy: number, radius: number, now: number): void {
    if (Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      const isOrbit = Math.random() > 0.35;
      this.acquireParticle({
        x: sx + Math.cos(a) * radius,
        y: sy + Math.sin(a) * radius,
        vx: isOrbit ? 0 : Math.cos(a) * 40 + (Math.random() - 0.5) * 15,
        vy: isOrbit ? 0 : Math.sin(a) * 40 + (Math.random() - 0.5) * 15,
        color: Math.random() > 0.5 ? '#F472B6' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        size: 2.5 + Math.random() * 1.8,
        bornAt: now,
        maxAgeMs: 400 + Math.random() * 200,
        friction: 0.91,
        orbitCenterX: isOrbit ? sx : undefined,
        orbitCenterY: isOrbit ? sy : undefined,
        orbitRadius: radius,
        orbitSpeed: 3.0 * (Math.random() > 0.5 ? 1 : -1),
        orbitAngle: a,
        shape: Math.random() > 0.5 ? 'starburst' : 'cross',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnBossEnrageBurst(bx: number, by: number, now: number): void {
    // Shockwave ring
    this.acquireParticle({
      x: bx,
      y: by,
      vx: 0,
      vy: 0,
      color: '#EF4444',
      size: 4,
      ringRadius: 2,
      ringMaxRadius: 45,
      ringLineWidth: 2.5,
      bornAt: now,
      maxAgeMs: 320,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + (Math.random() - 0.5) * 0.2;
      const speed = 75 + Math.random() * 85;
      this.acquireParticle({
        x: bx,
        y: by,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 15,
        color: i % 2 === 0 ? '#EF4444' : '#FDE047',
        secondaryColor: '#F97316',
        size: 2.2 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 320 + Math.random() * 180,
        gravity: 40,
        friction: 0.92,
        shape: i % 2 === 0 ? 'flame' : 'starburst',
        glow: true,
        priority: 'critical',
      });
    }
  }

  public spawnCleaveShockwaveSparks(x: number, y: number, angle: number, now: number): void {
    for (let i = 0; i < 6; i++) {
      const spread = angle + (Math.random() - 0.5) * 0.6;
      const speed = 140 + Math.random() * 120;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        color: Math.random() > 0.5 ? '#F59E0B' : '#FEF08A',
        secondaryColor: '#FFFFFF',
        size: 2.2 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 280 + Math.random() * 150,
        friction: 0.9,
        rotation: spread,
        angularVelocity: (Math.random() - 0.5) * 10,
        stretchWithVelocity: true,
        stretchFactor: 0.007,
        shape: i % 3 === 0 ? 'crescent' : i % 3 === 1 ? 'streak' : 'triangle',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnVaultGleam(vx: number, vy: number, active: boolean, now: number): void {
    if (active && Math.random() < 0.25) {
      this.acquireParticle({
        x: vx + (Math.random() - 0.5) * 24,
        y: vy - 8 + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 16,
        vy: -18 - Math.random() * 22,
        color: Math.random() > 0.5 ? '#FBBF24' : '#C084FC',
        secondaryColor: '#FEF08A',
        size: 2.0 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 600 + Math.random() * 250,
        friction: 0.96,
        wander: 6,
        fadeInRatio: 0.2,
        shape: Math.random() > 0.5 ? 'cross' : 'diamond',
        glow: true,
        priority: 'low',
      });
    }
  }

  /**
   * Spawns projectile wakes with time-based emission interval for steady trail density
   * across varying frame rates (30 FPS, 60 FPS, 120 FPS+).
   */
  public spawnProjectileWake(proj: ProjectileState, now: number): void {
    const lastSpawn = this.projectileLastSpawn.get(proj.id) || 0;
    // Standard projectile wake interval: ~26ms (~38 particles per second per projectile)
    const intervalMs = 26;
    if (now - lastSpawn < intervalMs) {
      return;
    }
    this.projectileLastSpawn.set(proj.id, now);

    let color = '#FDE68A';
    let secondaryColor: string | undefined = undefined;
    let colorEnd: string | undefined = undefined;
    let size = 1.8;
    let shape: ParticleShape = 'spark';
    let wander: number | undefined = undefined;
    let curveDrift: number | undefined = undefined;
    let stretchWithVelocity = false;
    let stretchFactor = 0.006;
    let attractX: number | undefined = undefined;
    let attractY: number | undefined = undefined;
    let attractStrength: number | undefined = undefined;
    let attractSpiralBias: number | undefined = undefined;
    let gravity: number | undefined = undefined;
    let maxAgeMs = 220 + Math.random() * 120;

    if (proj.style === 'arcane') {
      color = Math.random() > 0.5 ? '#38BDF8' : '#818CF8';
      secondaryColor = '#E0F2FE';
      colorEnd = '#4C1D95';
      shape = Math.random() > 0.4 ? 'rune' : 'diamond';
      size = 2.4;
      curveDrift = (Math.random() - 0.5) * 28;
      maxAgeMs = 300 + Math.random() * 140;
    } else if (proj.style === 'radiant') {
      color = '#FDE047';
      secondaryColor = '#FEF08A';
      colorEnd = '#F59E0B';
      shape = Math.random() > 0.4 ? 'cross' : 'starburst';
      size = 2.2;
      gravity = -14; // Upward floating holy sparkle
      maxAgeMs = 280 + Math.random() * 140;
    } else if (proj.style === 'arrow') {
      if (proj.slowOnHit) {
        // Ranger Frost Volley crystalline ice-arrow trail
        color = Math.random() > 0.4 ? '#BAE6FD' : '#38BDF8';
        secondaryColor = '#FFFFFF';
        colorEnd = '#0284C7';
        shape = Math.random() > 0.45 ? 'shard' : 'diamond';
        size = 2.0;
        wander = 8;
        maxAgeMs = 260 + Math.random() * 120;
      } else {
        // Standard Ashwood Arrow emerald wind wake
        color = '#34D399';
        secondaryColor = '#E2E8F0';
        colorEnd = '#059669';
        shape = Math.random() > 0.4 ? 'streak' : 'triangle';
        size = 1.6;
        stretchWithVelocity = true;
        stretchFactor = 0.008;
        wander = 6;
        maxAgeMs = 200 + Math.random() * 100;
      }
    } else if (proj.style === 'voidorb') {
      color = '#A855F7';
      secondaryColor = '#C084FC';
      colorEnd = '#3B0764';
      shape = Math.random() > 0.5 ? 'crescent' : 'smoke';
      size = 2.4;
      // Inward attraction back toward the traveling void orb core
      attractX = proj.x;
      attractY = proj.y;
      attractStrength = 75;
      attractSpiralBias = 0.35;
      maxAgeMs = 320 + Math.random() * 120;
    } else if (proj.style === 'fireball') {
      color = Math.random() > 0.5 ? '#F97316' : '#EF4444';
      secondaryColor = '#FEF08A';
      colorEnd = '#7F1D1D';
      shape = Math.random() > 0.5 ? 'flame' : 'smoke';
      size = 2.5;
      gravity = -20;
      maxAgeMs = 350 + Math.random() * 150;
    } else if (proj.style === 'slash') {
      color = proj.crit ? '#FDE047' : Math.random() > 0.5 ? '#F59E0B' : '#E2E8F0';
      secondaryColor = '#FFFFFF';
      shape = Math.random() > 0.5 ? 'crescent' : 'streak';
      size = proj.crit ? 2.6 : 2.0;
      stretchWithVelocity = true;
      stretchFactor = 0.009;
      maxAgeMs = 180 + Math.random() * 100;
    }

    this.acquireParticle({
      x: proj.x + (Math.random() - 0.5) * 4,
      y: proj.y + (Math.random() - 0.5) * 4,
      vx: -Math.cos(proj.angle) * 35 + (Math.random() - 0.5) * 15,
      vy: -Math.sin(proj.angle) * 35 + (Math.random() - 0.5) * 15,
      color,
      secondaryColor,
      colorEnd,
      size,
      bornAt: now,
      maxAgeMs,
      shape,
      gravity,
      friction: 0.9,
      rotation: proj.angle,
      wander,
      curveDrift,
      stretchWithVelocity,
      stretchFactor,
      attractX,
      attractY,
      attractStrength,
      attractSpiralBias,
      glow: true,
      priority: 'normal',
    });
  }

  /**
   * Prune tracking map for expired projectiles to prevent memory leaks.
   */
  public cleanupInactiveProjectiles(activeProjectileIds: Set<string>): void {
    for (const id of this.projectileLastSpawn.keys()) {
      if (!activeProjectileIds.has(id)) {
        this.projectileLastSpawn.delete(id);
      }
    }
  }

  // =========================================================================
  // HERO CLASS SPECIFIC VISUAL EFFECTS (VANGUARD, RANGER, ARCANIST, CLERIC)
  // =========================================================================

  /**
   * Spawns an inward-attracting suction vortex at the dash starting position.
   * Pulls class-themed energy, dust, or runes radially inward with spiral bias
   * into a collapsing ring and convergence flash.
   */
  public spawnDashInwardSuction(
    heroClass: HeroClassId,
    fromX: number,
    fromY: number,
    now: number = performance.now()
  ): void {
    const primaryColor =
      heroClass === 'vanguard'
        ? '#F59E0B'
        : heroClass === 'ranger'
          ? '#34D399'
          : heroClass === 'arcanist'
            ? '#C084FC'
            : '#FDE047';
    const secondaryColor =
      heroClass === 'vanguard'
        ? '#CBD5E1'
        : heroClass === 'ranger'
          ? '#86EFAC'
          : heroClass === 'arcanist'
            ? '#38BDF8'
            : '#FEF9C3';
    const suctionEndColor =
      heroClass === 'vanguard'
        ? '#475569'
        : heroClass === 'ranger'
          ? '#059669'
          : heroClass === 'arcanist'
            ? '#312E81'
            : '#D97706';

    // 1. Contracting suction ring collapsing toward launch center
    this.acquireParticle({
      x: fromX,
      y: fromY,
      vx: 0,
      vy: 0,
      color: primaryColor,
      colorEnd: secondaryColor,
      size: 3,
      ringRadius: 26,
      ringMaxRadius: 2,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 220,
      shape: 'ring',
      alphaStart: 0.9,
      alphaEnd: 0,
      alphaCurve: 'easeOut',
      glow: true,
      priority: 'high',
    });

    // 2. Radial inward-attracted vortex particles spiraling into starting position
    const count = 10;
    const spiralBias =
      heroClass === 'arcanist'
        ? 0.85
        : heroClass === 'ranger'
          ? 0.72
          : heroClass === 'cleric'
            ? 0.58
            : 0.45;

    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.25;
      const dist = 22 + Math.random() * 11;
      const px = fromX + Math.cos(a) * dist;
      const py = fromY + Math.sin(a) * dist;
      const shape: ParticleShape =
        heroClass === 'vanguard'
          ? i % 2 === 0
            ? 'shard'
            : 'hexagon'
          : heroClass === 'ranger'
            ? i % 2 === 0
              ? 'diamond'
              : 'streak'
            : heroClass === 'arcanist'
              ? i % 2 === 0
                ? 'rune'
                : 'diamond'
              : i % 2 === 0
                ? 'cross'
                : 'diamond';

      this.acquireParticle({
        x: px,
        y: py,
        vx: -Math.sin(a) * 28,
        vy: Math.cos(a) * 28,
        color: i % 2 === 0 ? primaryColor : secondaryColor,
        colorEnd: suctionEndColor,
        secondaryColor: '#FFFFFF',
        size: 2.0 + Math.random() * 0.8,
        startScale: 1.25,
        endScale: 0.3,
        scaleCurve: 'easeIn',
        bornAt: now,
        maxAgeMs: 220 + Math.random() * 70,
        attractX: fromX,
        attractY: fromY,
        attractStrength: 390,
        attractMinDist: 3,
        attractSpiralBias: spiralBias,
        friction: 0.92,
        stretchWithVelocity: true,
        stretchFactor: 0.008,
        rotation: a,
        angularVelocity: (i % 2 === 0 ? 1 : -1) * 8,
        shape,
        alphaStart: 0.9,
        alphaEnd: 0,
        fadeInRatio: 0.12,
        glow: i % 2 === 0,
        priority: 'high',
      });
    }

    // 3. Delayed center convergence pinpoint flash
    this.acquireParticle({
      x: fromX,
      y: fromY,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      colorEnd: primaryColor,
      secondaryColor,
      size: 3.5,
      startScale: 0.45,
      endScale: 1.35,
      bornAt: now + 65,
      maxAgeMs: 170,
      rotation: Math.PI / 4,
      angularVelocity: 6,
      shape: 'starburst',
      alphaStart: 0.9,
      alphaEnd: 0,
      glow: true,
      priority: 'high',
    });
  }

  /**
   * Emits a lingering spectral ghosting step behind a dashing hero during active dash duration.
   */
  public spawnClassDashTrailStep(
    heroClass: HeroClassId,
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    const primary =
      heroClass === 'vanguard'
        ? '#F59E0B'
        : heroClass === 'ranger'
          ? '#34D399'
          : heroClass === 'arcanist'
            ? '#A855F7'
            : '#FDE047';
    const secondary =
      heroClass === 'vanguard'
        ? '#CBD5E1'
        : heroClass === 'ranger'
          ? '#A7F3D0'
          : heroClass === 'arcanist'
            ? '#38BDF8'
            : '#FEF9C3';
    const fadeEnd =
      heroClass === 'vanguard'
        ? '#334155'
        : heroClass === 'ranger'
          ? '#065F46'
          : heroClass === 'arcanist'
            ? '#312E81'
            : '#B45309';
    const bodyShape: ParticleShape =
      heroClass === 'vanguard'
        ? 'hexagon'
        : heroClass === 'ranger'
          ? 'triangle'
          : heroClass === 'arcanist'
            ? 'rune'
            : 'cross';

    // Lingering spectral body echo
    this.acquireParticle({
      x: x + (Math.random() - 0.5) * 4,
      y: y - 2 + (Math.random() - 0.5) * 4,
      vx: -Math.cos(angle) * 16,
      vy: -Math.sin(angle) * 16,
      color: primary,
      colorEnd: fadeEnd,
      secondaryColor: secondary,
      size: 4.2,
      startScale: 1.15,
      endScale: 0.5,
      bornAt: now,
      maxAgeMs: 420,
      drag: 0.08,
      rotation: heroClass === 'ranger' ? angle : 0,
      angularVelocity: heroClass === 'arcanist' ? 4 : 0,
      shape: bodyShape,
      alphaStart: 0.55,
      alphaEnd: 0,
      alphaCurve: 'easeOut',
      glow: false,
      priority: 'normal',
    });

    // Trailing slipstream spark
    this.acquireParticle({
      x: x - Math.cos(angle) * 6 + (Math.random() - 0.5) * 10,
      y: y - Math.sin(angle) * 6 + (Math.random() - 0.5) * 10,
      vx: -Math.cos(angle) * (28 + Math.random() * 18),
      vy: -Math.sin(angle) * (28 + Math.random() * 18),
      color: secondary,
      colorEnd: primary,
      size: 1.9,
      bornAt: now,
      maxAgeMs: 360,
      friction: 0.91,
      stretchWithVelocity: true,
      stretchFactor: 0.007,
      shape: 'streak',
      alphaStart: 0.72,
      alphaEnd: 0,
      glow: false,
      priority: 'normal',
    });
  }

  /**
   * Universal class-themed procedural dash burst:
   * 1) Inward-attracting suction vortex at starting position.
   * 2) Lingering spectral particle ghosting & slipstream wake across the dash path.
   */
  public spawnClassDashEffect(
    heroClass: HeroClassId,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // 1. Starting-position inward-attracting suction vortex for all classes
    this.spawnDashInwardSuction(heroClass, fromX, fromY, now);

    // 2. Lingering staggered spectral afterimage ghosts along the dash trajectory
    const ghostSteps = 7;
    const primary =
      heroClass === 'vanguard'
        ? '#CBD5E1'
        : heroClass === 'ranger'
          ? '#34D399'
          : heroClass === 'arcanist'
            ? '#A855F7'
            : '#FDE047';
    const accent =
      heroClass === 'vanguard'
        ? '#F59E0B'
        : heroClass === 'ranger'
          ? '#86EFAC'
          : heroClass === 'arcanist'
            ? '#38BDF8'
            : '#FEF9C3';
    const ghostEnd =
      heroClass === 'vanguard'
        ? '#334155'
        : heroClass === 'ranger'
          ? '#065F46'
          : heroClass === 'arcanist'
            ? '#312E81'
            : '#B45309';

    for (let i = 0; i < ghostSteps; i++) {
      const t = 0.08 + (i / (ghostSteps - 1)) * 0.84;
      const gx = fromX + (toX - fromX) * t;
      const gy = fromY + (toY - fromY) * t;
      const spawnDelay = Math.round(t * 75);
      const fadeAlpha = 0.48 + t * 0.32;

      // Spectral silhouette core node (torso/cloak/robe echo)
      this.acquireParticle({
        x: gx,
        y: gy - 1,
        vx: -Math.cos(angle) * 12,
        vy: -Math.sin(angle) * 12,
        color: i % 2 === 0 ? primary : accent,
        colorEnd: ghostEnd,
        secondaryColor: '#FFFFFF',
        size: 5.2,
        startScale: 1.2,
        endScale: 0.45,
        bornAt: now + spawnDelay,
        maxAgeMs: 460 + Math.round(t * 140),
        drag: 0.09,
        rotation: heroClass === 'ranger' ? angle : 0,
        angularVelocity: heroClass === 'arcanist' ? 3.5 : 0,
        shape:
          heroClass === 'vanguard'
            ? 'hexagon'
            : heroClass === 'ranger'
              ? 'triangle'
              : heroClass === 'arcanist'
                ? 'rune'
                : 'cross',
        alphaStart: fadeAlpha,
        alphaEnd: 0,
        alphaCurve: 'easeOut',
        glow: i === 0 || i === ghostSteps - 1,
        priority: 'high',
      });

      // Head/crest spectral afterimage crown hovering above core
      this.acquireParticle({
        x: gx,
        y: gy - 9,
        vx: -Math.cos(angle) * 10,
        vy: -Math.sin(angle) * 10 - (heroClass === 'cleric' ? 8 : 0),
        color: accent,
        colorEnd: ghostEnd,
        size: 2.8,
        startScale: 1.0,
        endScale: 0.35,
        bornAt: now + spawnDelay,
        maxAgeMs: 430 + Math.round(t * 120),
        drag: 0.08,
        rotation: Math.PI / 4,
        shape: 'diamond',
        alphaStart: fadeAlpha * 0.85,
        alphaEnd: 0,
        alphaCurve: 'easeOut',
        priority: 'normal',
      });

      // Lingering mist/smoke/drift halo around each ghost step
      this.acquireParticle({
        x: gx + (Math.random() - 0.5) * 6,
        y: gy + 4 + (Math.random() - 0.5) * 4,
        vx: -Math.cos(angle) * 20 + (Math.random() - 0.5) * 10,
        vy: -Math.sin(angle) * 20 - 6,
        color: primary,
        colorEnd: ghostEnd,
        size: 3.4,
        startScale: 0.8,
        endScale: 1.5,
        bornAt: now + spawnDelay,
        maxAgeMs: 390,
        friction: 0.9,
        shape: 'smoke',
        alphaStart: 0.38,
        alphaEnd: 0,
        priority: 'normal',
      });
    }

    // 3. Class-specific motion streaks & arrival snap
    if (heroClass === 'vanguard') {
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        this.acquireParticle({
          x: fromX + (toX - fromX) * t + (Math.random() - 0.5) * 6,
          y: fromY + (toY - fromY) * t + (Math.random() - 0.5) * 6,
          vx: -Math.cos(angle) * (44 + i * 8),
          vy: -Math.sin(angle) * (44 + i * 8),
          color: i % 2 === 0 ? '#F59E0B' : '#CBD5E1',
          secondaryColor: '#FFFFFF',
          size: 2.3,
          bornAt: now,
          maxAgeMs: 280,
          friction: 0.89,
          rotation: angle,
          stretchWithVelocity: true,
          stretchFactor: 0.009,
          shape: i % 2 === 0 ? 'streak' : 'triangle',
          glow: true,
          priority: 'high',
        });
      }
    } else if (heroClass === 'ranger') {
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const spread = angle + (Math.random() - 0.5) * 0.7;
        this.acquireParticle({
          x: fromX + (toX - fromX) * t + (Math.random() - 0.5) * 10,
          y: fromY + (toY - fromY) * t + (Math.random() - 0.5) * 10,
          vx: -Math.cos(spread) * (48 + Math.random() * 35),
          vy: -Math.sin(spread) * (48 + Math.random() * 35),
          color: i % 2 === 0 ? '#34D399' : '#86EFAC',
          colorEnd: '#059669',
          size: 2.1,
          bornAt: now,
          maxAgeMs: 320,
          friction: 0.91,
          curveDrift: (i % 2 === 0 ? 1 : -1) * 35,
          wander: 10,
          stretchWithVelocity: true,
          stretchFactor: 0.008,
          shape: i % 2 === 0 ? 'diamond' : 'streak',
          glow: true,
          priority: 'high',
        });
      }
    } else if (heroClass === 'arcanist') {
      this.acquireParticle({
        x: toX,
        y: toY,
        vx: 0,
        vy: 0,
        color: '#38BDF8',
        secondaryColor: '#FFFFFF',
        size: 4.2,
        bornAt: now + 45,
        maxAgeMs: 240,
        rotation: 0,
        angularVelocity: 10,
        shape: 'starburst',
        glow: true,
        priority: 'high',
      });
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        this.acquireParticle({
          x: toX + Math.cos(a) * 18,
          y: toY + Math.sin(a) * 18,
          vx: -Math.cos(a) * 30,
          vy: -Math.sin(a) * 30,
          color: '#C084FC',
          size: 2.2,
          bornAt: now + 35,
          maxAgeMs: 260,
          attractX: toX,
          attractY: toY,
          attractStrength: 170,
          attractSpiralBias: 0.55,
          shape: 'rune',
          glow: true,
          priority: 'normal',
        });
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        this.acquireParticle({
          x: fromX + (toX - fromX) * t + (Math.random() - 0.5) * 8,
          y: fromY + (toY - fromY) * t + (Math.random() - 0.5) * 8,
          vx: -Math.cos(angle) * 22,
          vy: -Math.sin(angle) * 22 - 14,
          color: i % 2 === 0 ? '#FACC15' : '#FEF08A',
          secondaryColor: '#FFFFFF',
          size: 2.2,
          bornAt: now,
          maxAgeMs: 360,
          gravity: -18,
          friction: 0.92,
          shape: i % 2 === 0 ? 'cross' : 'starburst',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  /**
   * VANGUARD: Heavy kinetic cleave sweep with crescent arcs, steel shrapnel,
   * golden spark streaks, and expanding kinetic shockwave ring.
   */
  public spawnVanguardCleave(
    x: number,
    y: number,
    angle: number,
    isCrit: boolean = false,
    now: number = performance.now()
  ): void {
    const count = isCrit ? 12 : 7;
    // 1. Kinetic shockwave ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: isCrit ? '#FDE047' : '#F59E0B',
      secondaryColor: '#FFFFFF',
      size: 3,
      ringRadius: 4,
      ringMaxRadius: isCrit ? 38 : 26,
      ringLineWidth: isCrit ? 2.4 : 1.8,
      bornAt: now,
      maxAgeMs: 220,
      shape: 'ring',
      priority: 'high',
      glow: true,
    });

    if (isCrit) {
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#FFFFFF',
        secondaryColor: '#F59E0B',
        size: 4.5,
        bornAt: now,
        maxAgeMs: 190,
        rotation: angle,
        angularVelocity: 6,
        shape: 'starburst',
        priority: 'critical',
        glow: true,
      });
    }

    // 2. Heavy steel shards, sweeping crescents & directional spark streaks
    for (let i = 0; i < count; i++) {
      const spread = angle + (Math.random() - 0.5) * 1.15;
      const sp = (isCrit ? 145 : 95) + Math.random() * 80;
      this.acquireParticle({
        x: x + Math.cos(spread) * 6,
        y: y + Math.sin(spread) * 6,
        vx: Math.cos(spread) * sp,
        vy: Math.sin(spread) * sp,
        color: i % 2 === 0 ? '#F59E0B' : '#E2E8F0',
        secondaryColor: '#FEF08A',
        colorEnd: '#94A3B8',
        size: 2.3 + Math.random() * 1.6,
        bornAt: now,
        maxAgeMs: 240 + Math.random() * 120,
        friction: 0.9,
        rotation: spread,
        angularVelocity: (Math.random() - 0.5) * 12,
        stretchWithVelocity: true,
        stretchFactor: 0.008,
        shape: i % 3 === 0 ? 'crescent' : i % 3 === 1 ? 'shard' : 'streak',
        glow: true,
        priority: isCrit ? 'critical' : 'high',
      });
    }
  }

  /**
   * VANGUARD (Tactical: Bulwark Dash): Shield slam lunge leaving speed streaks,
   * dust clouds, an 84px stun shockwave ring, and bursting shield hexagons.
   */
  public spawnVanguardBulwarkDash(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // 1. Takeoff dust clouds at origin
    for (let i = 0; i < 3; i++) {
      this.acquireParticle({
        x: fromX + (Math.random() - 0.5) * 10,
        y: fromY + 6 + (Math.random() - 0.5) * 6,
        vx: -Math.cos(angle) * (25 + Math.random() * 20),
        vy: -Math.sin(angle) * (25 + Math.random() * 20) - 8,
        color: '#94A3B8',
        colorEnd: '#334155',
        size: 3.5 + Math.random() * 1.5,
        startScale: 0.8,
        endScale: 1.7,
        bornAt: now,
        maxAgeMs: 320,
        shape: 'smoke',
        alphaStart: 0.7,
        alphaEnd: 0,
        priority: 'normal',
      });
    }

    // 2. Rush streaks between origin and impact
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      this.acquireParticle({
        x: fromX + (toX - fromX) * t,
        y: fromY + (toY - fromY) * t,
        vx: Math.cos(angle) * 40,
        vy: Math.sin(angle) * 40,
        color: i % 2 === 0 ? '#FBBF24' : '#93C5FD',
        size: 2.5,
        bornAt: now,
        maxAgeMs: 240,
        rotation: angle,
        stretchWithVelocity: true,
        stretchFactor: 0.01,
        shape: 'streak',
        glow: true,
        priority: 'high',
      });
    }

    // 3. Stun slam shockwave rings at destination (84px stun radius)
    this.acquireParticle({
      x: toX,
      y: toY,
      vx: 0,
      vy: 0,
      color: '#F59E0B',
      size: 4,
      ringRadius: 8,
      ringMaxRadius: 82,
      ringLineWidth: 2.5,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'ring',
      glow: true,
      alphaStart: 0.95,
      alphaEnd: 0,
      priority: 'critical',
    });
    this.acquireParticle({
      x: toX,
      y: toY,
      vx: 0,
      vy: 0,
      color: '#93C5FD',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: 56,
      ringLineWidth: 1.8,
      bornAt: now,
      maxAgeMs: 260,
      shape: 'ring',
      glow: true,
      alphaStart: 0.85,
      alphaEnd: 0,
      priority: 'high',
    });

    // 4. Radial hexagon shield barrier & steel shards
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + angle * 0.25;
      const sp = 110 + Math.random() * 70;
      this.acquireParticle({
        x: toX,
        y: toY,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? '#F59E0B' : '#60A5FA',
        secondaryColor: '#FFFFFF',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 320 + Math.random() * 100,
        friction: 0.9,
        rotation: a,
        angularVelocity: 6,
        shape: i % 2 === 0 ? 'hexagon' : 'shard',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * VANGUARD (Ultimate: Aegis Sanctuary): Earth-slamming dome activation with
   * concentric golden/steel rings and orbiting hexagonal bastion plates.
   */
  public spawnVanguardAegisCast(
    x: number,
    y: number,
    radius: number = 105,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#F59E0B',
      size: 4,
      ringRadius: 10,
      ringMaxRadius: radius,
      ringLineWidth: 2.8,
      bornAt: now,
      maxAgeMs: 360,
      shape: 'ring',
      glow: true,
      alphaStart: 0.95,
      alphaEnd: 0,
      priority: 'critical',
    });
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#93C5FD',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: radius * 0.65,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'ring',
      glow: true,
      alphaStart: 0.9,
      alphaEnd: 0,
      priority: 'high',
    });

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x: x + Math.cos(a) * (radius * 0.9),
        y: y + Math.sin(a) * (radius * 0.9),
        vx: 0,
        vy: 0,
        color: i % 2 === 0 ? '#60A5FA' : '#FBBF24',
        secondaryColor: '#FFFFFF',
        size: 3.2,
        bornAt: now,
        maxAgeMs: 550,
        orbitCenterX: x,
        orbitCenterY: y,
        orbitRadius: radius * 0.95,
        orbitSpeed: 2.4,
        orbitAngle: a,
        rotation: a,
        angularVelocity: 5,
        shape: 'hexagon',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * VANGUARD: Shield granted shimmer around protected allies.
   */
  public spawnVanguardShieldGrant(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#93C5FD',
      size: 3,
      ringRadius: 22,
      ringMaxRadius: 8,
      ringLineWidth: 1.8,
      bornAt: now,
      maxAgeMs: 260,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      this.acquireParticle({
        x: x + Math.cos(a) * 18,
        y: y + Math.sin(a) * 18,
        vx: 0,
        vy: 0,
        color: i % 2 === 0 ? '#60A5FA' : '#FBBF24',
        secondaryColor: '#FFFFFF',
        size: 2.4,
        bornAt: now,
        maxAgeMs: 420,
        orbitCenterX: x,
        orbitCenterY: y,
        orbitRadius: 18,
        orbitSpeed: 4.0,
        orbitAngle: a,
        shape: 'hexagon',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * VANGUARD: Shield shatter burst when absorbed shield is depleted.
   */
  public spawnVanguardShieldBreak(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + Math.random() * 0.3;
      const sp = 85 + Math.random() * 65;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 15,
        color: i % 2 === 0 ? '#93C5FD' : '#FBBF24',
        secondaryColor: '#FFFFFF',
        size: 2.5,
        bornAt: now,
        maxAgeMs: 320,
        gravity: 90,
        friction: 0.92,
        rotation: a,
        angularVelocity: 9,
        shape: i % 2 === 0 ? 'hexagon' : 'shard',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * VANGUARD: Orbiting metallic golden & slate-blue hexagon shield plates
   * revolving around Aegis Dome or Shield Wall.
   */
  public spawnVanguardAegisMotes(
    x: number,
    y: number,
    radius: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.28) {
      const a = Math.random() * Math.PI * 2;
      this.acquireParticle({
        x: x + Math.cos(a) * radius,
        y: y + Math.sin(a) * radius,
        vx: 0,
        vy: 0,
        color: Math.random() > 0.5 ? '#F59E0B' : '#60A5FA',
        secondaryColor: '#FFFFFF',
        size: 2.4 + Math.random() * 1.2,
        bornAt: now,
        maxAgeMs: 420 + Math.random() * 180,
        orbitCenterX: x,
        orbitCenterY: y,
        orbitRadius: radius,
        orbitSpeed: 2.6 * (Math.random() > 0.5 ? 1 : -1),
        orbitAngle: a,
        rotation: a,
        angularVelocity: 4,
        shape: Math.random() > 0.35 ? 'hexagon' : 'ring',
        glow: false,
        priority: 'low',
      });
    }
  }

  /**
   * RANGER: Emerald wind arrow impact with leaf/triangle shrapnel and velocity streaks.
   */
  public spawnRangerArrowHit(
    x: number,
    y: number,
    angle: number,
    isCrit: boolean = false,
    now: number = performance.now()
  ): void {
    if (isCrit) {
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#FEF08A',
        secondaryColor: '#34D399',
        size: 4,
        bornAt: now,
        maxAgeMs: 180,
        shape: 'starburst',
        glow: true,
        priority: 'critical',
      });
    }
    const count = isCrit ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const spread = angle + (Math.random() - 0.5) * 1.2;
      const sp = 85 + Math.random() * 100;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(spread) * sp,
        vy: Math.sin(spread) * sp,
        color: i % 2 === 0 ? '#34D399' : '#86EFAC',
        secondaryColor: '#FFFFFF',
        colorEnd: '#059669',
        size: 2.1 + Math.random() * 1.4,
        bornAt: now,
        maxAgeMs: 240 + Math.random() * 120,
        friction: 0.91,
        wander: 8,
        stretchWithVelocity: true,
        stretchFactor: 0.007,
        shape: i % 3 === 0 ? 'triangle' : i % 3 === 1 ? 'diamond' : 'streak',
        glow: true,
        priority: isCrit ? 'critical' : 'high',
      });
    }
  }

  /**
   * RANGER (Tactical: Frost Volley): Crystalline 5-arrow fan release with icy mist
   * and chilled bowstring shockwave ring.
   */
  public spawnRangerFrostVolleyCast(
    x: number,
    y: number,
    aimAngle: number,
    now: number = performance.now()
  ): void {
    // 1. Crisp frost bow release ring
    this.acquireParticle({
      x: x + Math.cos(aimAngle) * 12,
      y: y + Math.sin(aimAngle) * 12,
      vx: 0,
      vy: 0,
      color: '#BAE6FD',
      size: 3,
      ringRadius: 4,
      ringMaxRadius: 24,
      ringLineWidth: 1.8,
      bornAt: now,
      maxAgeMs: 220,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    // 2. 5-arrow fan crystalline shards + chilled mist
    for (let i = -2; i <= 2; i++) {
      const ang = aimAngle + i * 0.14;
      const sp = 140 + Math.random() * 50;
      this.acquireParticle({
        x: x + Math.cos(ang) * 16,
        y: y + Math.sin(ang) * 16,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        color: i === 0 ? '#FFFFFF' : '#38BDF8',
        secondaryColor: '#BAE6FD',
        colorEnd: '#0284C7',
        size: 2.5,
        bornAt: now,
        maxAgeMs: 260,
        friction: 0.89,
        rotation: ang,
        angularVelocity: (Math.random() - 0.5) * 10,
        shape: Math.abs(i) % 2 === 0 ? 'shard' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * RANGER (Frost Volley arrow impact): Crystalline ice shatter & chill ring.
   */
  public spawnRangerFrostArrowHit(
    x: number,
    y: number,
    angle: number,
    isCrit: boolean = false,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#BAE6FD',
      size: 3,
      ringRadius: 2,
      ringMaxRadius: isCrit ? 24 : 16,
      ringLineWidth: 1.6,
      bornAt: now,
      maxAgeMs: 220,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    const count = isCrit ? 9 : 5;
    for (let i = 0; i < count; i++) {
      const spread = angle + (Math.random() - 0.5) * 1.4;
      const sp = 75 + Math.random() * 85;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(spread) * sp,
        vy: Math.sin(spread) * sp,
        color: i % 2 === 0 ? '#E0F2FE' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        colorEnd: '#0284C7',
        size: 2.2 + Math.random() * 1.2,
        bornAt: now,
        maxAgeMs: 280 + Math.random() * 120,
        friction: 0.9,
        rotation: spread,
        angularVelocity: (Math.random() - 0.5) * 12,
        shape: i % 2 === 0 ? 'shard' : 'diamond',
        glow: true,
        priority: isCrit ? 'critical' : 'high',
      });
    }
  }

  /**
   * RANGER (Ultimate: Hunter Quarry): Moonlight sonar wave exposing weak points.
   */
  public spawnRangerQuarryCast(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FBBF24',
      size: 4,
      ringRadius: 10,
      ringMaxRadius: 110,
      ringLineWidth: 2.2,
      bornAt: now,
      maxAgeMs: 360,
      shape: 'ring',
      glow: true,
      alphaStart: 0.9,
      alphaEnd: 0,
      priority: 'critical',
    });

    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      this.acquireParticle({
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * 95,
        vy: Math.sin(a) * 95,
        color: i % 2 === 0 ? '#FDE047' : '#34D399',
        secondaryColor: '#FFFFFF',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 340,
        friction: 0.9,
        rotation: a,
        angularVelocity: 5,
        shape: i % 2 === 0 ? 'diamond' : 'cross',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * RANGER: Quarry mark flash triggered when enemies are branded by Hunter Quarry.
   */
  public spawnRangerQuarryMark(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FBBF24',
      size: 3,
      ringRadius: 24,
      ringMaxRadius: 10,
      ringLineWidth: 1.8,
      bornAt: now,
      maxAgeMs: 240,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      this.acquireParticle({
        x: x + Math.cos(a) * 20,
        y: y + Math.sin(a) * 20,
        vx: -Math.cos(a) * 45,
        vy: -Math.sin(a) * 45,
        color: '#FDE047',
        secondaryColor: '#FFFFFF',
        size: 2.4,
        bornAt: now,
        maxAgeMs: 260,
        attractX: x,
        attractY: y,
        attractStrength: 150,
        shape: 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * RANGER: Haste surge wind trail with drifting emerald wind leaves and speed lines.
   */
  public spawnRangerSwiftnessTrail(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    if (Math.random() > 0.45) return;
    this.acquireParticle({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: -Math.cos(angle) * 32 + (Math.random() - 0.5) * 14,
      vy: -Math.sin(angle) * 32 + (Math.random() - 0.5) * 14,
      color: Math.random() > 0.5 ? '#34D399' : '#86EFAC',
      secondaryColor: '#059669',
      size: 2.0 + Math.random() * 1.1,
      bornAt: now,
      maxAgeMs: 280 + Math.random() * 140,
      friction: 0.92,
      wander: 10,
      curveDrift: (Math.random() - 0.5) * 24,
      stretchWithVelocity: true,
      stretchFactor: 0.006,
      shape: Math.random() > 0.5 ? 'diamond' : 'streak',
      glow: false,
      priority: 'low',
    });
  }

  /**
   * ARCANIST (Ultimate: Chrono Well): Temporal gravitational snare field casting burst.
   */
  public spawnArcanistChronoWellCast(
    x: number,
    y: number,
    radius: number = 100,
    now: number = performance.now()
  ): void {
    // 1. Central temporal flash
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#38BDF8',
      secondaryColor: '#FFFFFF',
      size: 5,
      bornAt: now,
      maxAgeMs: 280,
      rotation: 0,
      angularVelocity: 8,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });

    // 2. Contracting & expanding temporal rings
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#7CC6FE',
      size: 4,
      ringRadius: radius,
      ringMaxRadius: 12,
      ringLineWidth: 2.2,
      bornAt: now,
      maxAgeMs: 360,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#818CF8',
      size: 4,
      ringRadius: 8,
      ringMaxRadius: radius,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    // 3. Orbiting temporal runes
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x: x + Math.cos(a) * (radius * 0.7),
        y: y + Math.sin(a) * (radius * 0.7),
        vx: -Math.sin(a) * 35,
        vy: Math.cos(a) * 35,
        color: i % 2 === 0 ? '#38BDF8' : '#C084FC',
        secondaryColor: '#E0F2FE',
        size: 3,
        bornAt: now,
        maxAgeMs: 480,
        attractX: x,
        attractY: y,
        attractStrength: 140,
        attractSpiralBias: 0.55,
        spiralSpeed: 2.6,
        rotation: a,
        angularVelocity: 7,
        shape: i % 2 === 0 ? 'rune' : 'shard',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * ARCANIST (Ultimate: Chrono Well): Continuous inward-spiraling cosmic time shards & runes.
   */
  public spawnArcanistChronoMotes(
    x: number,
    y: number,
    radius: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.32) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.4 + Math.random() * 0.55);
      this.acquireParticle({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: -Math.sin(a) * 24,
        vy: Math.cos(a) * 24,
        color: Math.random() > 0.5 ? '#38BDF8' : '#818CF8',
        secondaryColor: '#E0F2FE',
        colorEnd: '#4C1D95',
        size: 2.2 + Math.random() * 1.2,
        bornAt: now,
        maxAgeMs: 460 + Math.random() * 180,
        attractX: x,
        attractY: y,
        attractStrength: 120,
        attractSpiralBias: 0.55,
        spiralSpeed: 2.5,
        spiralTangentialVelocity: 35,
        spiralRadialVelocity: -10,
        rotation: a,
        angularVelocity: 6,
        shape: Math.random() > 0.45 ? 'rune' : 'shard',
        glow: false,
        priority: 'low',
      });
    }
  }

  /**
   * Backward-compatible alias forwarding to Arcanist's Chrono Well motes.
   */
  public spawnRangerChronoMotes(
    x: number,
    y: number,
    radius: number,
    now: number = performance.now()
  ): void {
    this.spawnArcanistChronoMotes(x, y, radius, now);
  }

  /**
   * ARCANIST: Astral impact with spiraling cosmic runes, cyan starlight diamonds,
   * and starburst glint flash.
   */
  public spawnArcanistBoltHit(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // 1. Central starburst flash
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      secondaryColor: '#38BDF8',
      size: 4,
      bornAt: now,
      maxAgeMs: 180,
      shape: 'starburst',
      glow: true,
      priority: 'high',
    });

    // 2. Spiraling arcane glyphs & diamonds
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const sp = 50 + Math.random() * 40;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? '#38BDF8' : '#818CF8',
        secondaryColor: '#E0F2FE',
        colorEnd: '#4C1D95',
        size: 2.6 + Math.random() * 1.4,
        bornAt: now,
        maxAgeMs: 380 + Math.random() * 180,
        friction: 0.93,
        spiralSpeed: 3.0,
        spiralTangentialVelocity: 45,
        rotation: a,
        angularVelocity: 6,
        shape: i % 2 === 0 ? 'rune' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * ARCANIST (Tactical: Astral Nova): 8-way radial cosmic rune & starburst explosion.
   */
  public spawnArcanistNovaCast(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // 1. Core flash + nova shockwave ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      secondaryColor: '#C084FC',
      size: 5.5,
      bornAt: now,
      maxAgeMs: 220,
      rotation: 0,
      angularVelocity: 10,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#C084FC',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: 64,
      ringLineWidth: 2.4,
      bornAt: now,
      maxAgeMs: 280,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    // 2. 8 radial spiraling rune flares aligned to the 8-shard Astral Nova burst
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const sp = 115 + Math.random() * 35;
      this.acquireParticle({
        x: x + Math.cos(ang) * 12,
        y: y + Math.sin(ang) * 12,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        color: i % 2 === 0 ? '#C084FC' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        colorEnd: '#4C1D95',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 380,
        friction: 0.91,
        curveDrift: 35,
        spiralSpeed: 2.5,
        rotation: ang,
        angularVelocity: 8,
        shape: i % 2 === 0 ? 'rune' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * ARCANIST: Teleport / blink dissipation burst with spiraling runes and starbursts.
   */
  public spawnArcanistTeleportBurst(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10 + (Math.random() - 0.5) * 0.3;
      const sp = 60 + Math.random() * 60;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? '#C084FC' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        colorEnd: '#3B0764',
        size: 2.8 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 400 + Math.random() * 200,
        friction: 0.92,
        curveDrift: (Math.random() - 0.5) * 40,
        rotation: a,
        angularVelocity: 8,
        shape: i % 3 === 0 ? 'starburst' : i % 3 === 1 ? 'rune' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * ARCANIST: Star Rift inward-spiraling cosmic runes and void crescents.
   */
  public spawnArcanistStarRiftWisps(
    x: number,
    y: number,
    radius: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2;
      const dist = radius * 0.8 + Math.random() * 15;
      this.acquireParticle({
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        vx: -Math.cos(a) * 30,
        vy: -Math.sin(a) * 30,
        color: Math.random() > 0.5 ? '#C084FC' : '#38BDF8',
        secondaryColor: '#E0F2FE',
        size: 2.2 + Math.random() * 1.4,
        bornAt: now,
        maxAgeMs: 450 + Math.random() * 200,
        attractX: x,
        attractY: y,
        attractStrength: 130,
        attractSpiralBias: 0.4,
        spiralSpeed: 2.2,
        friction: 0.94,
        shape: Math.random() > 0.4 ? 'rune' : 'crescent',
        glow: false,
        priority: 'low',
      });
    }
  }

  /**
   * CLERIC: Solar sunburst cross impact with golden halo ring and divine light motes.
   */
  public spawnClericSmiteHit(
    x: number,
    y: number,
    isCrit: boolean = false,
    now: number = performance.now()
  ): void {
    // 1. Divine halo ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FDE047',
      secondaryColor: '#FFFFFF',
      size: 4,
      ringRadius: 3,
      ringMaxRadius: isCrit ? 32 : 22,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 250,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    // 2. Radiant sunburst crosses & glints
    const count = isCrit ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.3;
      const sp = 70 + Math.random() * 70;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 15,
        color: i % 2 === 0 ? '#FACC15' : '#FEF08A',
        secondaryColor: '#FFFFFF',
        size: 2.5 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 300 + Math.random() * 150,
        gravity: -15, // Upward floating holy radiance
        friction: 0.92,
        shape: i % 2 === 0 ? 'cross' : 'starburst',
        glow: true,
        priority: isCrit ? 'critical' : 'high',
      });
    }
  }

  /**
   * CLERIC (Tactical: Sanctified Pulse): Blinding golden wave ring + radiant cross beams.
   */
  public spawnClericSanctifiedPulse(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // 1. Expanding golden sacred wave rings (searing 135px radius)
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FDE047',
      size: 4,
      ringRadius: 8,
      ringMaxRadius: 120,
      ringLineWidth: 2.8,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      alphaStart: 0.95,
      alphaEnd: 0,
      priority: 'critical',
    });
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: 72,
      ringLineWidth: 1.8,
      bornAt: now,
      maxAgeMs: 260,
      shape: 'ring',
      glow: true,
      alphaStart: 0.9,
      alphaEnd: 0,
      priority: 'high',
    });

    // 2. Central radiant starburst
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      secondaryColor: '#FACC15',
      size: 6,
      bornAt: now,
      maxAgeMs: 260,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });

    // 3. Radial golden crosses & ascending glints
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const sp = 110 + Math.random() * 55;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 12,
        color: i % 2 === 0 ? '#FACC15' : '#FEF08A',
        secondaryColor: '#FFFFFF',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 380 + Math.random() * 140,
        gravity: -22,
        friction: 0.9,
        shape: i % 2 === 0 ? 'cross' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * CLERIC (Ultimate: Solar Beacon): Consecration sun pillar activation burst.
   */
  public spawnClericSolarBeaconCast(
    x: number,
    y: number,
    radius: number = 115,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FDE047',
      size: 4,
      ringRadius: 10,
      ringMaxRadius: radius,
      ringLineWidth: 2.6,
      bornAt: now,
      maxAgeMs: 380,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      secondaryColor: '#FDE047',
      size: 6.5,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x: x + Math.cos(a) * (radius * 0.45),
        y: y + Math.sin(a) * (radius * 0.45),
        vx: Math.cos(a) * 28,
        vy: -35 - Math.random() * 25,
        color: i % 2 === 0 ? '#FDE047' : '#FFFFFF',
        secondaryColor: '#FEF08A',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 520,
        gravity: -20,
        friction: 0.94,
        fadeInRatio: 0.15,
        shape: i % 2 === 0 ? 'cross' : 'starburst',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * CLERIC: Divine heal burst with expanding golden halo ring and ascending holy crosses.
   */
  public spawnClericHealBurst(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // 1. Halo expansion ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FEF08A',
      secondaryColor: '#FDE047',
      size: 4,
      ringRadius: 2,
      ringMaxRadius: 28,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 320,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    // 2. Ascending holy cross glints
    for (let i = 0; i < 8; i++) {
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 16,
        vy: -25 - Math.random() * 30,
        color: i % 2 === 0 ? '#FDE047' : '#FFFFFF',
        secondaryColor: '#FEF08A',
        size: 2.2 + Math.random() * 1.4,
        bornAt: now,
        maxAgeMs: 480 + Math.random() * 200,
        gravity: -20,
        friction: 0.95,
        fadeInRatio: 0.2,
        shape: i % 2 === 0 ? 'cross' : 'starburst',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * CLERIC: Solar Beacon & Radiant Aura ascending divine crosses and celestial glints.
   */
  public spawnClericBeaconMotes(
    x: number,
    y: number,
    radius: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.22) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.85;
      this.acquireParticle({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 10,
        vy: -20 - Math.random() * 20,
        color: Math.random() > 0.5 ? '#FDE047' : '#FEF08A',
        secondaryColor: '#FFFFFF',
        size: 2.0 + Math.random() * 1.2,
        bornAt: now,
        maxAgeMs: 460 + Math.random() * 180,
        gravity: -18,
        friction: 0.96,
        fadeInRatio: 0.2,
        shape: Math.random() > 0.4 ? 'cross' : 'starburst',
        glow: false,
        priority: 'low',
      });
    }
  }

  // =========================================================================
  // BOSS-SPECIFIC SKILL VISUAL EFFECTS (FLOORS 1-10)
  // =========================================================================

  // --- FLOOR 1: Warden Malakor (Highkeep Iron Knight / Shield Bastion) ---

  public spawnMalakorBulwarkCast(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // Heavy metallic bastion shockwave ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#60A5FA',
      colorEnd: '#F59E0B',
      size: 4,
      ringRadius: 8,
      ringMaxRadius: 48,
      ringLineWidth: 2.5,
      bornAt: now,
      maxAgeMs: 320,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    // Interlocking orbiting steel-gold hexagon shield plates
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x: x + Math.cos(a) * 34,
        y: y + Math.sin(a) * 34,
        vx: 0,
        vy: 0,
        color: i % 2 === 0 ? '#60A5FA' : '#F59E0B',
        secondaryColor: '#FFFFFF',
        size: 3.4,
        bornAt: now,
        maxAgeMs: 480,
        orbitCenterX: x,
        orbitCenterY: y,
        orbitRadius: 34,
        orbitSpeed: 4.0,
        orbitAngle: a,
        shape: 'hexagon',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnMalakorTripleCleave(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // Three crimson-steel greatsword crescent waves across the cleave cone
    const offsets = [-0.28, 0, 0.28];
    for (let idx = 0; idx < offsets.length; idx++) {
      const a = angle + offsets[idx];
      for (let k = 0; k < 4; k++) {
        const sp = 140 + k * 40;
        const spread = a + (Math.random() - 0.5) * 0.14;
        this.acquireParticle({
          x: x + Math.cos(a) * 16,
          y: y + Math.sin(a) * 16,
          vx: Math.cos(spread) * sp,
          vy: Math.sin(spread) * sp,
          color: k % 2 === 0 ? '#EF4444' : '#F59E0B',
          secondaryColor: '#FFFFFF',
          colorEnd: '#7F1D1D',
          size: k === 0 ? 4.2 : 2.5,
          bornAt: now,
          maxAgeMs: 300,
          friction: 0.9,
          rotation: spread,
          stretchWithVelocity: true,
          stretchFactor: 0.008,
          shape: k === 0 ? 'crescent' : 'streak',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  public spawnMalakorGroundSlamImpact(
    x: number,
    y: number,
    radius: number = 88,
    now: number = performance.now()
  ): void {
    // Highkeep seismic shockwave ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#F59E0B',
      colorEnd: '#EF4444',
      size: 5,
      ringRadius: 8,
      ringMaxRadius: radius * 0.9,
      ringLineWidth: 3.0,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    // Flying bastion cobblestone shards & dust plumes
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14 + (Math.random() - 0.5) * 0.2;
      const sp = 85 + Math.random() * 105;
      const isDust = i % 3 === 0;
      this.acquireParticle({
        x: x + Math.cos(a) * 10,
        y: y + Math.sin(a) * 10,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (isDust ? 20 : 35),
        color: isDust ? '#94A3B8' : i % 2 === 0 ? '#EF4444' : '#F59E0B',
        secondaryColor: '#FEF08A',
        colorEnd: '#334155',
        size: isDust ? 4.2 : 2.6,
        bornAt: now,
        maxAgeMs: isDust ? 420 : 340,
        gravity: isDust ? -12 : 160,
        friction: 0.9,
        rotation: a,
        angularVelocity: (Math.random() - 0.5) * 10,
        shape: isDust ? 'smoke' : i % 2 === 0 ? 'shard' : 'triangle',
        glow: !isDust,
        priority: 'high',
      });
    }
  }

  public spawnMalakorWarCharge(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // Roaring bull-rush ring + diamond crest
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#F59E0B',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: 42,
      ringLineWidth: 2.5,
      bornAt: now,
      maxAgeMs: 260,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    for (let i = 0; i < 10; i++) {
      const back = angle + Math.PI + (Math.random() - 0.5) * 0.8;
      const sp = 95 + Math.random() * 90;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(back) * sp,
        vy: Math.sin(back) * sp,
        color: i % 2 === 0 ? '#F59E0B' : '#EF4444',
        secondaryColor: '#FFFFFF',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 320,
        friction: 0.9,
        stretchWithVelocity: true,
        stretchFactor: 0.008,
        shape: i % 3 === 0 ? 'smoke' : 'streak',
        glow: i % 3 !== 0,
        priority: 'high',
      });
    }
  }

  public spawnMalakorChargeTrail(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.48) {
      const back = angle + Math.PI + (Math.random() - 0.5) * 0.5;
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 10,
        y: y + 8 + (Math.random() - 0.5) * 6,
        vx: Math.cos(back) * 65,
        vy: Math.sin(back) * 65,
        color: Math.random() > 0.5 ? '#F59E0B' : '#94A3B8',
        colorEnd: '#334155',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 260,
        friction: 0.9,
        shape: Math.random() > 0.4 ? 'smoke' : 'streak',
        stretchWithVelocity: true,
        glow: false,
        priority: 'low',
      });
    }
  }

  // --- FLOOR 2: Archlich Vaelor (Sunken Crypt Necromancer-Frost Lich) ---

  public spawnVaelorFrostNovaBurst(
    x: number,
    y: number,
    radius: number = 72,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#BAE6FD',
      colorEnd: '#A855F7',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: radius * 0.95,
      ringLineWidth: 2.8,
      bornAt: now,
      maxAgeMs: 320,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12 + (Math.random() - 0.5) * 0.2;
      const sp = 80 + Math.random() * 100;
      this.acquireParticle({
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 8,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 3 === 0 ? '#A855F7' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        colorEnd: '#1E1B4B',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 380,
        friction: 0.91,
        rotation: a,
        angularVelocity: 8,
        shape: i % 2 === 0 ? 'shard' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnVaelorSoulSiphonTether(
    targetX: number,
    targetY: number,
    bossX: number,
    bossY: number,
    now: number = performance.now()
  ): void {
    // Victim drain ring
    this.acquireParticle({
      x: targetX,
      y: targetY,
      vx: 0,
      vy: 0,
      color: '#A855F7',
      size: 3,
      ringRadius: 20,
      ringMaxRadius: 4,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 260,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    // Stream of stolen souls attracted from victim back to Vaelor's phylactery
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const sx = targetX + (bossX - targetX) * t + (Math.random() - 0.5) * 12;
      const sy = targetY + (bossY - targetY) * t + (Math.random() - 0.5) * 12;
      this.acquireParticle({
        x: sx,
        y: sy,
        vx: (bossX - sx) * 1.4,
        vy: (bossY - sy) * 1.4,
        color: i % 2 === 0 ? '#A855F7' : '#34D399',
        secondaryColor: '#E0F2FE',
        size: 2.6,
        bornAt: now + i * 18,
        maxAgeMs: 360,
        attractX: bossX,
        attractY: bossY,
        attractStrength: 340,
        attractMinDist: 6,
        attractSpiralBias: 0.45,
        shape: i % 2 === 0 ? 'rune' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }

    // Phylactery soul absorption starburst at boss
    this.acquireParticle({
      x: bossX,
      y: bossY,
      vx: 0,
      vy: 0,
      color: '#34D399',
      secondaryColor: '#FFFFFF',
      size: 4.5,
      bornAt: now + 90,
      maxAgeMs: 240,
      angularVelocity: 6,
      shape: 'starburst',
      glow: true,
      priority: 'high',
    });
  }

  public spawnVaelorSoulHail(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // 5 Spectral Soul-Frost Wisps bursting forward
    for (let k = -2; k <= 2; k++) {
      const a = angle + k * 0.24;
      for (let j = 0; j < 2; j++) {
        this.acquireParticle({
          x: x + Math.cos(a) * 14,
          y: y + Math.sin(a) * 14,
          vx: Math.cos(a) * (120 + j * 45),
          vy: Math.sin(a) * (120 + j * 45),
          color: j === 0 ? '#38BDF8' : '#C084FC',
          secondaryColor: '#FFFFFF',
          size: 2.5,
          bornAt: now,
          maxAgeMs: 340,
          friction: 0.92,
          curveDrift: k * 18,
          shape: j === 0 ? 'diamond' : 'rune',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  public spawnVaelorDeathRing(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#A855F7',
      colorEnd: '#38BDF8',
      size: 4,
      ringRadius: 10,
      ringMaxRadius: 72,
      ringLineWidth: 2.5,
      bornAt: now,
      maxAgeMs: 360,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      this.acquireParticle({
        x: x + Math.cos(a) * 12,
        y: y + Math.sin(a) * 12,
        vx: Math.cos(a) * 130,
        vy: Math.sin(a) * 130,
        color: i % 2 === 0 ? '#A855F7' : '#E2E8F0',
        secondaryColor: '#38BDF8',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 420,
        friction: 0.93,
        spiralSpeed: 2.0,
        shape: i % 2 === 0 ? 'rune' : 'shard',
        glow: true,
        priority: 'high',
      });
    }
  }

  // --- FLOOR 3: Ignis, Cinder Sovereign (Obsidian Caldera Fire Titan) ---

  public spawnIgnisMagmaEruption(
    x: number,
    y: number,
    radius: number = 84,
    now: number = performance.now()
  ): void {
    // Superheated molten geyser fountain + cracked obsidian shards
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14 + (Math.random() - 0.5) * 0.25;
      const isFlame = i % 3 !== 0;
      this.acquireParticle({
        x: x + Math.cos(a) * (Math.random() * radius * 0.4),
        y: y + Math.sin(a) * (Math.random() * radius * 0.4),
        vx: Math.cos(a) * (isFlame ? 35 : 95),
        vy: (isFlame ? -95 : Math.sin(a) * 95) - Math.random() * 40,
        color: isFlame ? (i % 2 === 0 ? '#F97316' : '#FEF08A') : '#7F1D1D',
        secondaryColor: '#FEF08A',
        colorEnd: '#450A0A',
        size: isFlame ? 3.4 : 2.6,
        bornAt: now,
        maxAgeMs: isFlame ? 460 : 380,
        gravity: isFlame ? -35 : 140,
        friction: 0.93,
        shape: isFlame ? 'flame' : 'shard',
        glow: isFlame,
        priority: 'high',
      });
    }
  }

  public spawnIgnisFissureWave(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // 5-prong ground magma cone
    for (let off = -2; off <= 2; off++) {
      const a = angle + off * 0.18;
      for (let d = 0; d < 2; d++) {
        this.acquireParticle({
          x: x + Math.cos(a) * 16,
          y: y + Math.sin(a) * 16,
          vx: Math.cos(a) * (135 + d * 45),
          vy: Math.sin(a) * (135 + d * 45),
          color: d === 0 ? '#F97316' : '#FEF08A',
          colorEnd: '#991B1B',
          size: d === 0 ? 3.2 : 2.2,
          bornAt: now,
          maxAgeMs: 360,
          friction: 0.91,
          stretchWithVelocity: true,
          shape: d === 0 ? 'flame' : 'triangle',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  public spawnIgnisCinderSpiral(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // Swirling Archimedean ember cyclone
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14;
      this.acquireParticle({
        x: x + Math.cos(a) * 16,
        y: y + Math.sin(a) * 16,
        vx: Math.cos(a) * 110,
        vy: Math.sin(a) * 110,
        color: i % 2 === 0 ? '#F59E0B' : '#EF4444',
        secondaryColor: '#FEF08A',
        colorEnd: '#7F1D1D',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 480,
        spiralSpeed: 4.5,
        curveDrift: 55,
        friction: 0.94,
        shape: i % 2 === 0 ? 'flame' : 'starburst',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnIgnisCoreDetonation(
    x: number,
    y: number,
    radius: number = 110,
    now: number = performance.now()
  ): void {
    for (let r = 0; r < 2; r++) {
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: r === 0 ? '#FEF08A' : '#EF4444',
        colorEnd: '#7F1D1D',
        size: 5,
        ringRadius: 8,
        ringMaxRadius: radius * (r === 0 ? 0.65 : 1.0),
        ringLineWidth: r === 0 ? 3.2 : 2.2,
        bornAt: now + r * 40,
        maxAgeMs: 360,
        shape: 'ring',
        glow: true,
        priority: 'critical',
      });
    }

    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      const sp = 100 + Math.random() * 110;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        color: i % 3 === 0 ? '#FEF08A' : i % 3 === 1 ? '#F97316' : '#EF4444',
        colorEnd: '#450A0A',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 440,
        friction: 0.9,
        shape: i % 3 === 0 ? 'starburst' : i % 3 === 1 ? 'flame' : 'shard',
        glow: true,
        priority: 'critical',
      });
    }
  }

  // --- FLOOR 4: Void-Eater Malice (Shadow Chasm Abyssal Leviathan) ---

  public spawnMaliceSingularityImplosion(
    x: number,
    y: number,
    radius: number = 115,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#F43F5E',
      colorEnd: '#581C87',
      size: 5,
      ringRadius: radius * 0.75,
      ringMaxRadius: 4,
      ringLineWidth: 3.2,
      bornAt: now,
      maxAgeMs: 280,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      this.acquireParticle({
        x: x + Math.cos(a) * (radius * 0.55),
        y: y + Math.sin(a) * (radius * 0.55),
        vx: -Math.cos(a) * 60,
        vy: -Math.sin(a) * 60,
        color: i % 2 === 0 ? '#E879F9' : '#F43F5E',
        colorEnd: '#0F0718',
        size: 3.2,
        bornAt: now,
        maxAgeMs: 300,
        attractX: x,
        attractY: y,
        attractStrength: 420,
        attractSpiralBias: 0.7,
        shape: i % 2 === 0 ? 'crescent' : 'rune',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnMaliceTendrilFlurry(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // 6 whipping shadow tentacles radiating outward
    for (let k = 0; k < 6; k++) {
      const a = angle + (k * Math.PI * 2) / 6;
      for (let j = 0; j < 2; j++) {
        this.acquireParticle({
          x: x + Math.cos(a) * 14,
          y: y + Math.sin(a) * 14,
          vx: Math.cos(a) * (145 + j * 40),
          vy: Math.sin(a) * (145 + j * 40),
          color: j === 0 ? '#A855F7' : '#F43F5E',
          colorEnd: '#0F0718',
          size: 2.8,
          bornAt: now,
          maxAgeMs: 360,
          waveAmplitude: 5,
          waveFrequency: 8,
          curveDrift: (k % 2 === 0 ? 1 : -1) * 45,
          rotation: a,
          shape: j === 0 ? 'crescent' : 'streak',
          stretchWithVelocity: true,
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  public spawnMaliceVoidStep(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    now: number = performance.now()
  ): void {
    // Departure implosion at old coordinate
    this.spawnMaliceSingularityImplosion(fromX, fromY, 52, now);
    // Arrival abyssal scythe starburst at new coordinate
    this.acquireParticle({
      x: toX,
      y: toY,
      vx: 0,
      vy: 0,
      color: '#E879F9',
      secondaryColor: '#F43F5E',
      size: 6,
      bornAt: now,
      maxAgeMs: 280,
      angularVelocity: 8,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x: toX,
        y: toY,
        vx: Math.cos(a) * 125,
        vy: Math.sin(a) * 125,
        color: i % 2 === 0 ? '#E879F9' : '#A855F7',
        colorEnd: '#0F0718',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 320,
        rotation: a,
        angularVelocity: 10,
        shape: 'crescent',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnMaliceAbyssalNova(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#F43F5E',
      colorEnd: '#581C87',
      size: 5,
      ringRadius: 10,
      ringMaxRadius: 78,
      ringLineWidth: 3,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 145,
        vy: Math.sin(a) * 145,
        color: i % 2 === 0 ? '#F43F5E' : '#A855F7',
        colorEnd: '#0F0718',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 420,
        spiralSpeed: 3.0,
        rotation: a,
        shape: i % 2 === 0 ? 'crescent' : 'smoke',
        glow: i % 2 === 0,
        priority: 'high',
      });
    }
  }

  // --- FLOOR 5: Archon of Nothingness (Void Spire Cosmic Celestial) ---

  public spawnArchonSupernovaBurst(
    x: number,
    y: number,
    radius: number = 140,
    now: number = performance.now()
  ): void {
    for (let r = 0; r < 2; r++) {
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: r === 0 ? '#F472B6' : '#38BDF8',
        size: 5,
        ringRadius: 12,
        ringMaxRadius: radius * (r === 0 ? 1.0 : 0.7),
        ringLineWidth: 3.2,
        bornAt: now + r * 35,
        maxAgeMs: 380,
        shape: 'ring',
        glow: true,
        priority: 'critical',
      });
    }

    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 155,
        vy: Math.sin(a) * 155,
        color: i % 3 === 0 ? '#F472B6' : i % 3 === 1 ? '#38BDF8' : '#FEF08A',
        secondaryColor: '#FFFFFF',
        size: 3.2,
        bornAt: now,
        maxAgeMs: 420,
        friction: 0.91,
        shape: i % 2 === 0 ? 'starburst' : 'cross',
        glow: true,
        priority: 'critical',
      });
    }
  }

  public spawnArchonStarbeamStrike(
    x: number,
    y: number,
    radius: number = 70,
    now: number = performance.now()
  ): void {
    // Descending orbital celestial pillar streaks slamming into ground
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#38BDF8',
      colorEnd: '#FEF08A',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: radius * 0.9,
      ringLineWidth: 2.8,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    for (let i = 0; i < 6; i++) {
      const ox = (Math.random() - 0.5) * radius * 0.8;
      this.acquireParticle({
        x: x + ox,
        y: y - 70 - i * 16,
        vx: 0,
        vy: 360,
        color: i % 2 === 0 ? '#FFFFFF' : '#FEF08A',
        secondaryColor: '#38BDF8',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 240,
        stretchWithVelocity: true,
        stretchFactor: 0.01,
        shape: 'streak',
        glow: true,
        priority: 'high',
      });
    }

    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FEF08A',
      secondaryColor: '#FFFFFF',
      size: 6,
      bornAt: now,
      maxAgeMs: 280,
      angularVelocity: 8,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });
  }

  public spawnArchonCosmicVolley(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    for (let k = -2; k <= 3; k++) {
      const a = angle + k * 0.16;
      this.acquireParticle({
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * 165,
        vy: Math.sin(a) * 165,
        color: k % 2 === 0 ? '#818CF8' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 320,
        friction: 0.92,
        rotation: a,
        shape: k % 2 === 0 ? 'shard' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnArchonConstellationSpiral(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 140,
        vy: Math.sin(a) * 140,
        color: i % 2 === 0 ? '#38BDF8' : '#FEF08A',
        secondaryColor: '#818CF8',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 440,
        spiralSpeed: 2.6,
        friction: 0.94,
        shape: i % 2 === 0 ? 'rune' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  // --- FLOOR 6: Elyndor, Keeper of the Last Hymn (Golden Harp Choir Angel) ---

  public spawnElyndorResonantCrescendo(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // Expanding golden harp acoustic rings
    for (let r = 0; r < 2; r++) {
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: r === 0 ? '#FEF08A' : '#F59E0B',
        size: 4,
        ringRadius: 8,
        ringMaxRadius: 56 + r * 18,
        ringLineWidth: 2.2,
        bornAt: now + r * 45,
        maxAgeMs: 360,
        shape: 'ring',
        glow: true,
        priority: 'high',
      });
    }

    // Harmonic sinusoidal wave notes sweeping outward along lane axis
    for (let i = 0; i < 9; i++) {
      const a = angle + (i - 4) * 0.14;
      this.acquireParticle({
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * 130,
        vy: Math.sin(a) * 130,
        color: i % 2 === 0 ? '#FEF08A' : '#FBBF24',
        secondaryColor: '#FFFFFF',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 420,
        waveAmplitude: 6,
        waveFrequency: 9,
        friction: 0.93,
        shape: i % 2 === 0 ? 'diamond' : 'cross',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnElyndorHarpLaneMotes(
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.28) {
      const along = (Math.random() - 0.5) * width * 0.85;
      const across = (Math.random() - 0.5) * height * 0.7;
      const px = x + Math.cos(angle) * along - Math.sin(angle) * across;
      const py = y + Math.sin(angle) * along + Math.cos(angle) * across;
      this.acquireParticle({
        x: px,
        y: py,
        vx: Math.cos(angle) * 35,
        vy: Math.sin(angle) * 35 - 12,
        color: '#FEF08A',
        colorEnd: '#F59E0B',
        size: 2.0,
        bornAt: now,
        maxAgeMs: 380,
        waveAmplitude: 3,
        waveFrequency: 7,
        shape: Math.random() > 0.5 ? 'diamond' : 'cross',
        glow: false,
        priority: 'low',
      });
    }
  }

  public spawnElyndorLamentBurst(
    x: number,
    y: number,
    radius: number = 65,
    now: number = performance.now()
  ): void {
    // Consecrated golden prayer chime ring + ascending hymn crosses
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FEF08A',
      colorEnd: '#F59E0B',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: radius * 0.9,
      ringLineWidth: 2.4,
      bornAt: now,
      maxAgeMs: 320,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const sp = 55 + Math.random() * 65;
      this.acquireParticle({
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 8,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 24,
        color: i % 2 === 0 ? '#FEF08A' : '#FFFFFF',
        secondaryColor: '#F59E0B',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 420,
        gravity: -22,
        friction: 0.93,
        shape: i % 2 === 0 ? 'cross' : 'starburst',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnElyndorDivineChorus(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // 3 sweeping harmonic choir chord beams
    for (let c = -1; c <= 1; c++) {
      const beamAngle = angle + c * 0.45;
      for (let j = 0; j < 4; j++) {
        this.acquireParticle({
          x: x + Math.cos(beamAngle) * (16 + j * 14),
          y: y + Math.sin(beamAngle) * (16 + j * 14),
          vx: Math.cos(beamAngle) * 185,
          vy: Math.sin(beamAngle) * 185,
          color: j % 2 === 0 ? '#FBBF24' : '#FFFBEB',
          size: 2.6,
          bornAt: now + j * 18,
          maxAgeMs: 340,
          stretchWithVelocity: true,
          stretchFactor: 0.009,
          shape: j % 2 === 0 ? 'streak' : 'cross',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  public spawnElyndorChorusRemembrance(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // Full-arena 5-way harp psalm starburst + grand acoustic resonance
    for (let r = 0; r < 2; r++) {
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: '#FEF08A',
        size: 5,
        ringRadius: 12,
        ringMaxRadius: 72 + r * 28,
        ringLineWidth: 2.6,
        bornAt: now + r * 55,
        maxAgeMs: 420,
        shape: 'ring',
        glow: true,
        priority: 'critical',
      });
    }
    for (let i = 0; i < 15; i++) {
      const a = (i * Math.PI * 2) / 15;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 125,
        vy: Math.sin(a) * 125 - 15,
        color: i % 3 === 0 ? '#FFFFFF' : i % 3 === 1 ? '#FEF08A' : '#F59E0B',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 480,
        gravity: -16,
        friction: 0.93,
        shape: i % 2 === 0 ? 'starburst' : 'cross',
        glow: true,
        priority: 'critical',
      });
    }
  }

  // --- FLOOR 7: Zadkiel, Keeper of the Ashen Reliquary ---

  public spawnZadkielAshenCloudMotes(
    x: number,
    y: number,
    radius: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.36) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.78;
      const isAsh = Math.random() > 0.35;
      this.acquireParticle({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 16,
        vy: -18 - Math.random() * 20,
        color: isAsh ? '#A8A29E' : '#D9AA52',
        colorEnd: '#44403C',
        secondaryColor: '#FEF08A',
        size: isAsh ? 3.8 : 2.1,
        startScale: isAsh ? 0.9 : 1.0,
        endScale: isAsh ? 1.6 : 0.3,
        bornAt: now,
        maxAgeMs: 560 + Math.random() * 220,
        friction: 0.95,
        wander: 8,
        shape: isAsh ? 'smoke' : 'diamond',
        glow: false,
        priority: 'low',
      });
    }
  }

  public spawnZadkielCenserSweepSparks(
    x: number,
    y: number,
    angle: number,
    radius: number,
    progress: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.55) {
      const startAng = angle - (Math.PI * 3) / 4;
      const sweepCur = startAng + Math.PI * 1.5 * progress;
      const headX = x + Math.cos(sweepCur) * radius;
      const headY = y + Math.sin(sweepCur) * radius;
      const tangAngle = sweepCur + Math.PI / 2;
      this.acquireParticle({
        x: headX + (Math.random() - 0.5) * 6,
        y: headY + (Math.random() - 0.5) * 6,
        vx: -Math.cos(tangAngle) * 45 + (Math.random() - 0.5) * 20,
        vy: -Math.sin(tangAngle) * 45 - 15,
        color: Math.random() > 0.4 ? '#F59E0B' : '#CBD5E1',
        secondaryColor: '#FEF08A',
        colorEnd: '#78716C',
        size: 2.5,
        bornAt: now,
        maxAgeMs: 320,
        friction: 0.92,
        shape: Math.random() > 0.4 ? 'flame' : 'hexagon',
        glow: false,
        priority: 'normal',
      });
    }
  }

  public spawnZadkielReliquaryAwakening(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#CBD5E1',
      colorEnd: '#D9AA52',
      size: 4,
      ringRadius: 8,
      ringMaxRadius: 56,
      ringLineWidth: 2.2,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      this.acquireParticle({
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * 65,
        vy: Math.sin(a) * 65 - 20,
        color: i % 2 === 0 ? '#E2E8F0' : '#D9AA52',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 420,
        gravity: -18,
        friction: 0.94,
        shape: i % 2 === 0 ? 'hexagon' : 'cross',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnZadkielRelicDetonation(
    x: number,
    y: number,
    radius: number = 70,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#D9AA52',
      size: 4,
      ringRadius: 8,
      ringMaxRadius: radius * 0.9,
      ringLineWidth: 2.5,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 85,
        vy: Math.sin(a) * 85 - 24,
        color: i % 2 === 0 ? '#E2E8F0' : '#D9AA52',
        colorEnd: '#57534E',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 400,
        gravity: -20,
        friction: 0.92,
        shape: i % 3 === 0 ? 'smoke' : i % 2 === 0 ? 'diamond' : 'cross',
        glow: i % 3 !== 0,
        priority: 'high',
      });
    }
  }

  public spawnZadkielJudgmentCast(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    for (let off = -1; off <= 1; off++) {
      const a = angle + off * 0.3;
      for (let j = 0; j < 4; j++) {
        this.acquireParticle({
          x: x + Math.cos(a) * 14,
          y: y + Math.sin(a) * 14,
          vx: Math.cos(a) * (130 + j * 30),
          vy: Math.sin(a) * (130 + j * 30),
          color: j % 2 === 0 ? '#FEF08A' : '#D9AA52',
          colorEnd: '#57534E',
          size: 2.8,
          bornAt: now,
          maxAgeMs: 360,
          friction: 0.92,
          stretchWithVelocity: true,
          shape: j % 2 === 0 ? 'flame' : 'shard',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  // --- FLOOR 8: Sariel, Warden of the Veiled Scripture ---

  public spawnSarielScriptureBinding(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // Intersecting calligraphic ink & forbidden purple rune bursts
    for (let axis = 0; axis < 4; axis++) {
      const a = angle + (axis * Math.PI) / 2;
      for (let step = 1; step <= 4; step++) {
        this.acquireParticle({
          x: x + Math.cos(a) * (step * 26),
          y: y + Math.sin(a) * (step * 26),
          vx: Math.cos(a) * 35,
          vy: Math.sin(a) * 35,
          color: step % 2 === 0 ? '#E879F9' : '#FEF08A',
          colorEnd: '#581C87',
          size: 2.8,
          bornAt: now + step * 25,
          maxAgeMs: 360,
          angularVelocity: 5,
          shape: step % 2 === 0 ? 'rune' : 'cross',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  public spawnSarielScriptureDetonation(
    x: number,
    y: number,
    width: number,
    angle: number,
    now: number = performance.now()
  ): void {
    const half = width * 0.42;
    for (let i = -4; i <= 4; i++) {
      const dist = (i / 4) * half;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      this.acquireParticle({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 35,
        vy: (Math.random() - 0.5) * 35 - 15,
        color: i % 2 === 0 ? '#E879F9' : '#FEF08A',
        colorEnd: '#581C87',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 320,
        shape: i % 2 === 0 ? 'rune' : 'starburst',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnSarielForbiddenPageBurst(
    x: number,
    y: number,
    radius: number = 60,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#E879F9',
      colorEnd: '#FEF08A',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: radius * 0.9,
      ringLineWidth: 2.4,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 95,
        vy: Math.sin(a) * 95 - 15,
        color: i % 3 === 0 ? '#FAF8F5' : i % 3 === 1 ? '#A855F7' : '#F59E0B',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 380,
        friction: 0.91,
        angularVelocity: 8,
        shape: i % 2 === 0 ? 'rune' : 'diamond',
        glow: i % 3 !== 0,
        priority: 'high',
      });
    }
  }

  public spawnSarielSilenceSealMotes(
    x: number,
    y: number,
    radius: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      const dist = radius * 0.85;
      this.acquireParticle({
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        vx: -Math.cos(a) * 28,
        vy: -Math.sin(a) * 28,
        color: Math.random() > 0.5 ? '#C084FC' : '#FEF08A',
        size: 2.2,
        bornAt: now,
        maxAgeMs: 380,
        attractX: x,
        attractY: y,
        attractStrength: 150,
        attractSpiralBias: 0.65,
        shape: Math.random() > 0.5 ? 'rune' : 'hexagon',
        glow: false,
        priority: 'low',
      });
    }
  }

  public spawnSarielSilenceDetonation(
    x: number,
    y: number,
    radius: number = 75,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#C084FC',
      size: 4,
      ringRadius: radius * 0.8,
      ringMaxRadius: 4,
      ringLineWidth: 2.6,
      bornAt: now,
      maxAgeMs: 260,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x: x + Math.cos(a) * 10,
        y: y + Math.sin(a) * 10,
        vx: Math.cos(a) * 85,
        vy: Math.sin(a) * 85,
        color: i % 2 === 0 ? '#E879F9' : '#FEF08A',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 340,
        friction: 0.92,
        shape: i % 2 === 0 ? 'hexagon' : 'rune',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnSarielHereticalVolley(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      const isHoly = i % 2 === 0;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 135,
        vy: Math.sin(a) * 135,
        color: isHoly ? '#FEF08A' : '#F43F5E',
        secondaryColor: isHoly ? '#FFFFFF' : '#A855F7',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 420,
        spiralSpeed: isHoly ? 2.8 : -2.8,
        friction: 0.93,
        shape: isHoly ? 'rune' : 'crescent',
        glow: true,
        priority: 'critical',
      });
    }
  }

  // --- FLOOR 9: Seraphel, Sentinel of the Final Seal (Solar Lance Archangel) ---

  public spawnSeraphelPiercingLine(
    x: number,
    y: number,
    angle: number,
    width: number = 380,
    now: number = performance.now()
  ): void {
    // Blinding spearhead starburst at runway end + supersonic streaks down the corridor
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const dist = (s / (steps - 1)) * width;
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist;
      this.acquireParticle({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * 140,
        vy: Math.sin(angle) * 140,
        color: s % 2 === 0 ? '#FFFFFF' : '#FDE047',
        secondaryColor: '#38BDF8',
        size: 3.0,
        bornAt: now + s * 14,
        maxAgeMs: 260,
        stretchWithVelocity: true,
        stretchFactor: 0.01,
        shape: s === steps - 1 ? 'starburst' : 'streak',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnSeraphelLancefallImpact(
    x: number,
    y: number,
    radius: number = 65,
    now: number = performance.now()
  ): void {
    // High-speed plunging lance streak + solar impact shockwave + sky shards
    this.acquireParticle({
      x,
      y: y - 55,
      vx: 0,
      vy: 380,
      color: '#FFFFFF',
      secondaryColor: '#FDE047',
      size: 3.5,
      bornAt: now,
      maxAgeMs: 180,
      stretchWithVelocity: true,
      stretchFactor: 0.01,
      shape: 'streak',
      glow: true,
      priority: 'critical',
    });
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FDE047',
      colorEnd: '#38BDF8',
      size: 4,
      ringRadius: 6,
      ringMaxRadius: radius * 0.95,
      ringLineWidth: 2.8,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 115,
        vy: Math.sin(a) * 115,
        color: i % 2 === 0 ? '#FBBF24' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        size: 2.6,
        bornAt: now,
        maxAgeMs: 320,
        friction: 0.91,
        rotation: a,
        shape: i % 2 === 0 ? 'shard' : 'cross',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnSeraphelAerialJudgment(
    x: number,
    y: number,
    angle: number,
    now: number = performance.now()
  ): void {
    // 3-way winged sky-blue & solar feather-quill dive trails
    for (let d = -1; d <= 1; d++) {
      const diveAng = angle + d * 0.35;
      for (let j = 0; j < 4; j++) {
        this.acquireParticle({
          x: x + Math.cos(diveAng) * (j * 16),
          y: y + Math.sin(diveAng) * (j * 16),
          vx: Math.cos(diveAng) * 170,
          vy: Math.sin(diveAng) * 170,
          color: j % 2 === 0 ? '#38BDF8' : '#FEF08A',
          secondaryColor: '#FFFFFF',
          size: 2.8,
          bornAt: now,
          maxAgeMs: 320,
          rotation: diveAng,
          stretchWithVelocity: true,
          shape: j % 2 === 0 ? 'triangle' : 'streak',
          glow: true,
          priority: 'high',
        });
      }
    }
  }

  public spawnSeraphelSpearfallCascade(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FBBF24',
      size: 5,
      ringRadius: 10,
      ringMaxRadius: 86,
      ringLineWidth: 2.6,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      this.acquireParticle({
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * 110,
        vy: Math.sin(a) * 110,
        color: i % 2 === 0 ? '#FBBF24' : '#38BDF8',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 380,
        friction: 0.92,
        shape: i % 2 === 0 ? 'cross' : 'shard',
        glow: true,
        priority: 'high',
      });
    }
  }

  // --- FLOOR 10: Oriphiel, The Last Warden (Supreme Solar Aegis Archangel) ---

  public spawnOriphielWardenEdictCast(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // Imperial crimson-gold decree starburst + radiating cardinal beams
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#EF4444',
      colorEnd: '#F59E0B',
      size: 5,
      ringRadius: 10,
      ringMaxRadius: 68,
      ringLineWidth: 2.8,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 140,
        vy: Math.sin(a) * 140,
        color: i % 2 === 0 ? '#EF4444' : '#FEF08A',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 360,
        stretchWithVelocity: true,
        shape: i % 2 === 0 ? 'streak' : 'cross',
        glow: true,
        priority: 'high',
      });
    }
  }

  public spawnOriphielEdictExecution(
    x: number,
    y: number,
    radius: number,
    quadrant: number,
    now: number = performance.now()
  ): void {
    // Sweeping guillotine crescent slashes across the condemned arena quadrant
    const startAng = (quadrant * Math.PI) / 2;
    for (let i = 0; i < 5; i++) {
      const a = startAng + ((i + 0.5) / 5) * (Math.PI / 2);
      const dist = radius * (0.45 + (i % 2) * 0.25);
      this.acquireParticle({
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        vx: Math.cos(a) * 60,
        vy: Math.sin(a) * 60,
        color: i % 2 === 0 ? '#EF4444' : '#FEF08A',
        secondaryColor: '#FFFFFF',
        size: 4.0,
        bornAt: now,
        maxAgeMs: 340,
        rotation: a,
        shape: i % 2 === 0 ? 'crescent' : 'starburst',
        glow: true,
        priority: 'critical',
      });
    }
  }

  public spawnOriphielParryStance(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    if (Math.random() < 0.42) {
      const a = Math.random() * Math.PI * 2;
      this.acquireParticle({
        x: x + Math.cos(a) * 42,
        y: y + Math.sin(a) * 42,
        vx: 0,
        vy: 0,
        color: Math.random() > 0.5 ? '#F59E0B' : '#FEF08A',
        size: 3.0,
        bornAt: now,
        maxAgeMs: 380,
        orbitCenterX: x,
        orbitCenterY: y,
        orbitRadius: 42,
        orbitSpeed: 3.6,
        orbitAngle: a,
        shape: 'hexagon',
        glow: false,
        priority: 'normal',
      });
    }
  }

  public spawnOriphielParryReflectBurst(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // Explosive mirrored solar-aegis counter-rebound burst
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      secondaryColor: '#F59E0B',
      size: 6.5,
      bornAt: now,
      maxAgeMs: 300,
      angularVelocity: 10,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FEF08A',
      size: 5,
      ringRadius: 10,
      ringMaxRadius: 72,
      ringLineWidth: 3.0,
      bornAt: now,
      maxAgeMs: 300,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * 165,
        vy: Math.sin(a) * 165,
        color: i % 2 === 0 ? '#FEF08A' : '#F59E0B',
        size: 2.8,
        bornAt: now,
        maxAgeMs: 340,
        friction: 0.91,
        stretchWithVelocity: true,
        shape: i % 2 === 0 ? 'shard' : 'streak',
        glow: true,
        priority: 'critical',
      });
    }
  }

  public spawnOriphielVerdictStage(
    x: number,
    y: number,
    radius: number,
    stage: number,
    now: number = performance.now()
  ): void {
    const isFinalSlam = stage >= 3;
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: isFinalSlam ? '#EF4444' : '#FEF08A',
      size: 5,
      ringRadius: 10,
      ringMaxRadius: radius * 0.95,
      ringLineWidth: isFinalSlam ? 3.5 : 2.6,
      bornAt: now,
      maxAgeMs: 340,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    const count = isFinalSlam ? 14 : 8;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * (isFinalSlam ? 145 : 105),
        vy: Math.sin(a) * (isFinalSlam ? 145 : 105),
        color: isFinalSlam ? (i % 2 === 0 ? '#EF4444' : '#FEF08A') : '#FBBF24',
        secondaryColor: '#FFFFFF',
        size: isFinalSlam ? 3.4 : 2.8,
        bornAt: now,
        maxAgeMs: 360,
        friction: 0.9,
        rotation: a,
        shape: isFinalSlam ? (i % 2 === 0 ? 'shard' : 'starburst') : 'crescent',
        glow: true,
        priority: 'critical',
      });
    }
  }

  public spawnOriphielBastionShatter(
    x: number,
    y: number,
    radius: number = 190,
    now: number = performance.now()
  ): void {
    // Sovereign alabaster-gold seismic earthquake
    for (let r = 0; r < 2; r++) {
      this.acquireParticle({
        x,
        y,
        vx: 0,
        vy: 0,
        color: r === 0 ? '#FEF08A' : '#F59E0B',
        size: 6,
        ringRadius: 16,
        ringMaxRadius: radius * (r === 0 ? 1.0 : 0.65),
        ringLineWidth: 3.2,
        bornAt: now + r * 45,
        maxAgeMs: 420,
        shape: 'ring',
        glow: true,
        priority: 'critical',
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      const isDust = i % 4 === 0;
      this.acquireParticle({
        x: x + Math.cos(a) * 16,
        y: y + Math.sin(a) * 16,
        vx: Math.cos(a) * (isDust ? 75 : 155),
        vy: Math.sin(a) * (isDust ? 75 : 155) - 18,
        color: isDust ? '#FAF8F5' : i % 2 === 0 ? '#F59E0B' : '#FEF08A',
        colorEnd: '#78716C',
        size: isDust ? 4.4 : 3.2,
        bornAt: now,
        maxAgeMs: 460,
        gravity: isDust ? -14 : 120,
        friction: 0.91,
        rotation: a,
        shape: isDust ? 'smoke' : i % 2 === 0 ? 'shard' : 'cross',
        glow: !isDust,
        priority: 'critical',
      });
    }
  }

  /**
   * ROOM CLEAR & SANCTUM BLESSING: Golden-emerald radiant chime burst with rising runes and starbursts.
   */
  public spawnRoomClearBlessing(
    x: number,
    y: number,
    isGuardian: boolean = false,
    now: number = performance.now()
  ): void {
    const primary = isGuardian ? '#F59E0B' : '#34D399';
    const secondary = isGuardian ? '#FEF08A' : '#A7F3D0';

    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: primary,
      secondaryColor: secondary,
      size: 6,
      ringRadius: 8,
      ringMaxRadius: isGuardian ? 68 : 48,
      ringLineWidth: isGuardian ? 3.0 : 2.2,
      bornAt: now,
      maxAgeMs: 420,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    this.acquireParticle({
      x,
      y: y - 4,
      vx: 0,
      vy: -12,
      color: '#FFFFFF',
      secondaryColor: primary,
      size: isGuardian ? 7 : 5,
      bornAt: now,
      maxAgeMs: 320,
      rotation: 0,
      angularVelocity: 5,
      shape: 'starburst',
      glow: true,
      priority: 'high',
    });

    const count = isGuardian ? 14 : 10;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      const sp = 35 + Math.random() * 45;
      this.acquireParticle({
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 8,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 28,
        color: i % 2 === 0 ? primary : secondary,
        colorEnd: '#FFFFFF',
        size: 2.6 + Math.random() * 1.4,
        bornAt: now,
        maxAgeMs: 480 + Math.random() * 180,
        gravity: -22,
        friction: 0.94,
        spiralSpeed: 2.0,
        spiralTangentialVelocity: 24,
        rotation: a,
        angularVelocity: 5,
        shape: i % 3 === 0 ? 'rune' : i % 2 === 0 ? 'cross' : 'diamond',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * BOSS WARD SHATTER: Hexagonal barrier plates and arcane shards exploding outward from Boss.
   */
  public spawnBossWardShatter(
    x: number,
    y: number,
    remainingWards: number = 0,
    now: number = performance.now()
  ): void {
    const allBroken = remainingWards <= 0;
    const ringColor = allBroken ? '#FACC15' : '#38BDF8';
    const shardColor = allBroken ? '#FEF08A' : '#A855F7';

    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: ringColor,
      size: 6,
      ringRadius: 24,
      ringMaxRadius: allBroken ? 90 : 66,
      ringLineWidth: allBroken ? 3.5 : 2.5,
      bornAt: now,
      maxAgeMs: 380,
      shape: 'ring',
      glow: true,
      priority: 'critical',
    });

    const count = allBroken ? 16 : 11;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.2;
      const sp = 95 + Math.random() * 65;
      this.acquireParticle({
        x: x + Math.cos(a) * 20,
        y: y + Math.sin(a) * 20,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? ringColor : shardColor,
        secondaryColor: '#FFFFFF',
        colorEnd: '#312E81',
        size: i % 2 === 0 ? 3.6 : 2.8,
        bornAt: now,
        maxAgeMs: 420 + Math.random() * 140,
        friction: 0.90,
        rotation: a,
        angularVelocity: (Math.random() > 0.5 ? 1 : -1) * 9,
        shape: i % 2 === 0 ? 'hexagon' : 'shard',
        glow: true,
        priority: 'critical',
      });
    }
  }

  // =========================================================================
  // REUSABLE PROCEDURAL EFFECT STYLES (ELEMENTAL & COMBAT BUILDING BLOCKS)
  // =========================================================================

  /**
   * FIRE: Fiery explosion with flickering flame tongues, crackling spark streaks,
   * soft expanding dark smoke clouds, and glowing embers.
   */
  public spawnFireBurst(
    x: number,
    y: number,
    count: number = 14,
    now: number = performance.now()
  ): void {
    // 1. Central shockwave ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#F97316',
      size: 4,
      ringRadius: 2,
      ringMaxRadius: 28,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 280,
      shape: 'ring',
      priority: 'high',
      glow: true,
      alphaStart: 0.9,
      alphaEnd: 0,
    });

    // 2. Flickering flame tongues rising upward
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.4;
      const sp = 45 + Math.random() * 80;
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 25,
        color: i % 2 === 0 ? '#F97316' : '#EF4444',
        secondaryColor: '#FEF08A',
        colorEnd: '#7F1D1D',
        size: 2.2 + Math.random() * 2,
        startScale: 1.2,
        endScale: 0.3,
        scaleCurve: 'easeOut',
        bornAt: now,
        maxAgeMs: 420 + Math.random() * 220,
        gravity: -25, // Upward buoyant smoke/fire
        drag: 0.08,
        shape: 'flame',
        glow: true,
        priority: 'high',
      });
    }

    // 3. Smoke puffs rising and expanding
    for (let i = 0; i < Math.floor(count * 0.5); i++) {
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 12,
        y: y - 4 + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 25,
        color: '#4B5563',
        colorEnd: '#1F2937',
        size: 3.5 + Math.random() * 2.5,
        startScale: 0.7,
        endScale: 1.8,
        bornAt: now + 50,
        maxAgeMs: 550 + Math.random() * 200,
        drag: 0.04,
        wander: 8,
        shape: 'smoke',
        alphaStart: 0.65,
        alphaEnd: 0,
        priority: 'normal',
      });
    }

    // 4. Fast crackling spark streaks
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 110 + Math.random() * 90;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: '#FDE047',
        colorEnd: '#EA580C',
        size: 2,
        bornAt: now,
        maxAgeMs: 250 + Math.random() * 120,
        drag: 0.12,
        stretchWithVelocity: true,
        stretchFactor: 0.007,
        shape: 'streak',
        priority: 'high',
        glow: true,
      });
    }
  }

  public spawnFlamePuff(
    x: number,
    y: number,
    vx: number = 0,
    vy: number = -35,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: vx + (Math.random() - 0.5) * 10,
      vy: vy - Math.random() * 15,
      color: '#F97316',
      secondaryColor: '#FEF08A',
      colorEnd: '#991B1B',
      size: 2.5 + Math.random() * 1.5,
      startScale: 1.1,
      endScale: 0.4,
      bornAt: now,
      maxAgeMs: 380 + Math.random() * 150,
      gravity: -15,
      drag: 0.05,
      shape: 'flame',
      glow: true,
      priority: 'normal',
    });
  }

  /**
   * ICE: Shattering crystalline shards, frost diamonds with angular spin,
   * expanding frost shockwave ring, and snow motes with wave-like drift.
   */
  public spawnIceShatter(
    x: number,
    y: number,
    count: number = 14,
    now: number = performance.now()
  ): void {
    // 1. Expanding pale-blue frost ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#7DD3FC',
      size: 3,
      ringRadius: 3,
      ringMaxRadius: 32,
      ringLineWidth: 1.8,
      bornAt: now,
      maxAgeMs: 320,
      shape: 'ring',
      glow: true,
      priority: 'high',
      alphaStart: 0.85,
      alphaEnd: 0,
    });

    // 2. Directional crystal shards with angular spin
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.3;
      const sp = 70 + Math.random() * 110;
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? '#38BDF8' : '#BAE6FD',
        secondaryColor: '#FFFFFF',
        colorEnd: '#0284C7',
        size: 2.2 + Math.random() * 1.8,
        startScale: 1.2,
        endScale: 0.4,
        bornAt: now,
        maxAgeMs: 380 + Math.random() * 200,
        friction: 0.92,
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 16,
        shape: i % 3 === 0 ? 'diamond' : 'shard',
        glow: true,
        priority: 'high',
      });
    }

    // 3. Gentle drifting snowflake motes with wave oscillation
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.acquireParticle({
        x: x + Math.cos(a) * (10 + Math.random() * 15),
        y: y + Math.sin(a) * (10 + Math.random() * 15),
        vx: (Math.random() - 0.5) * 15,
        vy: 10 + Math.random() * 15,
        color: '#E0F2FE',
        secondaryColor: '#38BDF8',
        size: 1.6,
        bornAt: now,
        maxAgeMs: 600 + Math.random() * 250,
        friction: 0.96,
        waveAmplitude: 6,
        waveFrequency: 2.5,
        shape: 'spark',
        priority: 'normal',
      });
    }
  }

  public spawnFrostRing(
    x: number,
    y: number,
    radius: number = 24,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#38BDF8',
      size: 4,
      ringRadius: 4,
      ringMaxRadius: radius,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 360,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });

    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      this.acquireParticle({
        x: x + Math.cos(a) * radius,
        y: y + Math.sin(a) * radius,
        vx: 0,
        vy: 0,
        color: '#BAE6FD',
        secondaryColor: '#FFFFFF',
        size: 2,
        bornAt: now,
        maxAgeMs: 400,
        shape: 'diamond',
        orbitCenterX: x,
        orbitCenterY: y,
        orbitRadius: radius,
        orbitSpeed: 3.2,
        orbitAngle: a,
        rotation: a,
        angularVelocity: 4,
        glow: true,
        priority: 'normal',
      });
    }
  }

  /**
   * LIGHTNING: Violent zigzag electric discharge arcs, high-velocity streaks,
   * triangular sparks, and dazzling starburst flashes.
   */
  public spawnLightningArc(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    now: number = performance.now()
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(3, Math.floor(dist / 14));
    let curX = x1;
    let curY = y1;

    for (let i = 1; i <= steps; i++) {
      const targetX = x1 + (dx * i) / steps;
      const targetY = y1 + (dy * i) / steps;
      const perpX = -dy / (dist || 1);
      const perpY = dx / (dist || 1);
      const jitter = i < steps ? (Math.random() - 0.5) * 16 : 0;
      const midX = targetX + perpX * jitter;
      const midY = targetY + perpY * jitter;

      const segVx = (midX - curX) * 2;
      const segVy = (midY - curY) * 2;

      this.acquireParticle({
        x: (curX + midX) / 2,
        y: (curY + midY) / 2,
        vx: segVx,
        vy: segVy,
        color: '#FDE047',
        secondaryColor: '#FFFFFF',
        colorEnd: '#38BDF8',
        size: 2.2,
        bornAt: now,
        maxAgeMs: 140 + Math.random() * 80,
        drag: 0.15,
        stretchWithVelocity: true,
        stretchFactor: 0.008,
        shape: 'streak',
        glow: true,
        priority: 'critical',
      });

      curX = midX;
      curY = midY;
    }

    // Impact flash at end
    this.acquireParticle({
      x: x2,
      y: y2,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      secondaryColor: '#FDE047',
      size: 3.5,
      bornAt: now,
      maxAgeMs: 180,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });
  }

  public spawnShockBurst(
    x: number,
    y: number,
    count: number = 12,
    now: number = performance.now()
  ): void {
    // 1. Central electric flash
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      secondaryColor: '#FDE047',
      size: 4.5,
      bornAt: now,
      maxAgeMs: 160,
      shape: 'starburst',
      glow: true,
      priority: 'critical',
    });

    // 2. High-speed directional electric sparks
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.4;
      const sp = 120 + Math.random() * 140;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? '#FACC15' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        colorEnd: '#60A5FA',
        size: 2.2,
        bornAt: now,
        maxAgeMs: 200 + Math.random() * 120,
        drag: 0.14,
        stretchWithVelocity: true,
        stretchFactor: 0.007,
        shape: i % 3 === 0 ? 'triangle' : 'streak',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * ARCANE MAGIC: Spiraling arcane runes, rotating astral diamonds,
   * and glowing starburst glints with curved drift.
   */
  public spawnArcaneSpiral(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    // 1. Central rotating arcane starburst
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#C084FC',
      secondaryColor: '#FFFFFF',
      size: 4,
      bornAt: now,
      maxAgeMs: 350,
      rotation: 0,
      angularVelocity: 8,
      shape: 'starburst',
      glow: true,
      priority: 'high',
    });

    // 2. Spiraling arcane glyphs
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      const sp = 55 + Math.random() * 45;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? '#A855F7' : '#38BDF8',
        secondaryColor: '#E9D5FF',
        colorEnd: '#6B21A8',
        size: 3,
        startScale: 1.2,
        endScale: 0.3,
        bornAt: now,
        maxAgeMs: 500 + Math.random() * 200,
        curveDrift: 40,
        spiralSpeed: 3,
        spiralTangentialVelocity: 55,
        spiralRadialVelocity: 12,
        rotation: a,
        angularVelocity: 6,
        shape: 'rune',
        glow: true,
        priority: 'high',
      });
    }

    // 3. Floating astral diamonds
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.acquireParticle({
        x: x + Math.cos(a) * 16,
        y: y + Math.sin(a) * 16,
        vx: Math.cos(a) * 25,
        vy: Math.sin(a) * 25 - 15,
        color: '#E879F9',
        secondaryColor: '#FFFFFF',
        size: 2.2,
        bornAt: now,
        maxAgeMs: 450 + Math.random() * 150,
        friction: 0.94,
        shape: 'diamond',
        rotation: Math.random() * Math.PI,
        angularVelocity: 4,
        glow: true,
        priority: 'normal',
      });
    }
  }

  public spawnArcaneRuneBurst(
    x: number,
    y: number,
    count: number = 12,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.3;
      const sp = 60 + Math.random() * 80;
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: i % 2 === 0 ? '#C084FC' : '#818CF8',
        secondaryColor: '#FFFFFF',
        size: 2.8 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 420 + Math.random() * 220,
        friction: 0.93,
        curveDrift: (Math.random() - 0.5) * 50,
        rotation: a,
        angularVelocity: (Math.random() - 0.5) * 10,
        shape: 'rune',
        glow: true,
        priority: 'high',
      });
    }
  }

  /**
   * HOLY ENERGY: Radiant sun crosses, expanding golden halo ring,
   * and floating celestial glints with fade-in and high glow.
   */
  public spawnHolyRadiance(
    x: number,
    y: number,
    count: number = 10,
    now: number = performance.now()
  ): void {
    // 1. Divine halo ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FDE047',
      size: 4,
      ringRadius: 2,
      ringMaxRadius: 36,
      ringLineWidth: 2.2,
      bornAt: now,
      maxAgeMs: 380,
      shape: 'ring',
      glow: true,
      glowBlur: 6,
      priority: 'high',
    });

    // 2. Radiant sun crosses
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.25;
      const sp = 50 + Math.random() * 70;
      this.acquireParticle({
        x: x + Math.cos(a) * 6,
        y: y + Math.sin(a) * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        color: '#FACC15',
        secondaryColor: '#FFFFFF',
        colorEnd: '#FEF08A',
        size: 2.6 + Math.random() * 1.6,
        startScale: 0.8,
        endScale: 1.2,
        scaleCurve: 'easeOut',
        bornAt: now,
        maxAgeMs: 500 + Math.random() * 250,
        friction: 0.94,
        wander: 10,
        fadeInRatio: 0.15,
        shape: 'cross',
        glow: true,
        glowBlur: 5,
        priority: 'high',
      });
    }
  }

  public spawnHolyCrossGleam(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: -15,
      color: '#FEF08A',
      secondaryColor: '#FFFFFF',
      colorEnd: '#F59E0B',
      size: 4.5,
      startScale: 0.6,
      endScale: 1.4,
      bornAt: now,
      maxAgeMs: 480,
      shape: 'cross',
      glow: true,
      glowBlur: 8,
      fadeInRatio: 0.2,
      priority: 'critical',
    });

    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      size: 3.5,
      bornAt: now,
      maxAgeMs: 250,
      shape: 'starburst',
      glow: true,
      priority: 'high',
    });
  }

  /**
   * SHADOW & VOID: Inward-attracted dark void crescents and purple runes pulled
   * into a gravitational center, ending with an abyssal collapse ring.
   */
  public spawnVoidCollapse(
    x: number,
    y: number,
    radius: number = 40,
    now: number = performance.now()
  ): void {
    // 1. Inward collapsing crescents & runes
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14 + (Math.random() - 0.5) * 0.3;
      const dist = radius + Math.random() * 20;
      this.acquireParticle({
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        vx: -Math.cos(a) * 40,
        vy: -Math.sin(a) * 40,
        color: i % 2 === 0 ? '#7E22CE' : '#C084FC',
        secondaryColor: '#3B0764',
        size: 2.8 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 380 + Math.random() * 120,
        attractX: x,
        attractY: y,
        attractStrength: 180,
        attractMinDist: 6,
        attractSpiralBias: 0.35,
        spiralSpeed: 2.2,
        friction: 0.95,
        rotation: a,
        angularVelocity: 6,
        shape: i % 2 === 0 ? 'crescent' : 'rune',
        glow: true,
        priority: 'high',
      });
    }

    // 2. Abyssal singularity collapse ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#A855F7',
      size: 3,
      ringRadius: radius,
      ringMaxRadius: 2,
      ringLineWidth: 2,
      bornAt: now,
      maxAgeMs: 320,
      shape: 'ring',
      glow: true,
      priority: 'high',
    });
  }

  public spawnVoidMotes(
    x: number,
    y: number,
    count: number = 10,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 40;
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 10,
        color: '#6B21A8',
        secondaryColor: '#C084FC',
        colorEnd: '#0F172A',
        size: 2.5 + Math.random() * 2,
        startScale: 1.0,
        endScale: 0.3,
        bornAt: now,
        maxAgeMs: 500 + Math.random() * 250,
        wander: 12,
        waveAmplitude: 4,
        waveFrequency: 2,
        shape: i % 3 === 0 ? 'smoke' : 'crescent',
        priority: 'normal',
      });
    }
  }

  /**
   * POISON: Toxic emerald vapor clouds, bubbling caustic rings with buoyancy,
   * and dripping acid streaks.
   */
  public spawnPoisonCloud(
    x: number,
    y: number,
    radius: number = 25,
    count: number = 12,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.acquireParticle({
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        vx: (Math.random() - 0.5) * 15,
        vy: -15 - Math.random() * 20, // Gentle upward bubbling
        color: i % 2 === 0 ? '#22C55E' : '#15803D',
        secondaryColor: '#86EFAC',
        colorEnd: '#064E3B',
        size: 3.5 + Math.random() * 2.5,
        startScale: 0.6,
        endScale: 1.6,
        bornAt: now,
        maxAgeMs: 650 + Math.random() * 300,
        gravity: -10,
        drag: 0.05,
        wander: 8,
        shape: i % 3 === 0 ? 'ring' : 'smoke',
        alphaStart: 0.7,
        alphaEnd: 0,
        priority: 'high',
      });
    }
  }

  public spawnToxicBubbles(
    x: number,
    y: number,
    now: number = performance.now()
  ): void {
    for (let i = 0; i < 4; i++) {
      this.acquireParticle({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -20 - Math.random() * 25,
        color: '#4ADE80',
        secondaryColor: '#BBF7D0',
        size: 2.2 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 450 + Math.random() * 200,
        waveAmplitude: 5,
        waveFrequency: 3,
        shape: 'ring',
        ringRadius: 1.5,
        ringMaxRadius: 3.5,
        ringLineWidth: 1.2,
        priority: 'normal',
      });
    }
  }

  /**
   * PHYSICAL IMPACTS: Directional cone of sharp triangular shrapnel,
   * high-velocity spark streaks, and expanding circular shockwave ring.
   */
  public spawnPhysicalImpact(
    x: number,
    y: number,
    angle: number = 0,
    count: number = 10,
    now: number = performance.now()
  ): void {
    // 1. Kinetic shockwave ring
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#E2E8F0',
      size: 3,
      ringRadius: 2,
      ringMaxRadius: 22,
      ringLineWidth: 1.8,
      bornAt: now,
      maxAgeMs: 220,
      shape: 'ring',
      priority: 'high',
      alphaStart: 0.85,
      alphaEnd: 0,
    });

    // 2. Directional sharp triangular shrapnel and streaks
    for (let i = 0; i < count; i++) {
      const spread = angle + (Math.random() - 0.5) * 1.2;
      const sp = 80 + Math.random() * 120;
      this.acquireParticle({
        x,
        y,
        vx: Math.cos(spread) * sp,
        vy: Math.sin(spread) * sp,
        color: i % 2 === 0 ? '#F1F5F9' : '#CBD5E1',
        secondaryColor: '#64748B',
        size: 2.0 + Math.random() * 1.8,
        bornAt: now,
        maxAgeMs: 260 + Math.random() * 140,
        friction: 0.91,
        rotation: spread,
        angularVelocity: (Math.random() - 0.5) * 14,
        shape: i % 3 === 0 ? 'triangle' : i % 3 === 1 ? 'shard' : 'streak',
        stretchWithVelocity: true,
        stretchFactor: 0.006,
        priority: 'high',
      });
    }
  }

  public spawnImpactRing(
    x: number,
    y: number,
    radius: number = 18,
    now: number = performance.now()
  ): void {
    this.acquireParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#CBD5E1',
      size: 3,
      ringRadius: 3,
      ringMaxRadius: radius,
      ringLineWidth: 1.6,
      bornAt: now,
      maxAgeMs: 200,
      shape: 'ring',
      priority: 'high',
    });
  }

  // =========================================================================
  // CORE PARTICLE SIMULATION & PROCEDURAL RENDERING ENGINE
  // =========================================================================

  public updateAndDraw(
    ctx: CanvasRenderingContext2D,
    now: number,
    dtSec: number
  ): void {
    const list = this.particles;
    const len = list.length;
    if (len === 0) return;

    let writeIdx = 0;

    for (let i = 0; i < len; i++) {
      const p = list[i];
      const age = now - p.bornAt;
      if (age < 0) {
        list[writeIdx++] = p;
        continue;
      }
      if (age >= p.maxAgeMs) {
        this.recycleParticle(p);
        continue;
      }

      const progress = Math.min(1, Math.max(0, age / p.maxAgeMs));

      // --- Advanced Motion Dynamics ---

      // 1. Linear Accelerations
      if (p.ax) p.vx += p.ax * dtSec;
      if (p.ay) p.vy += p.ay * dtSec;

      // 2. Inward Attraction (Gravitational Wells & Vortex Swirl)
      if (p.attractX !== undefined && p.attractY !== undefined && p.attractStrength) {
        applyInwardAttraction(p, dtSec);
      }

      // 3. Lateral Curve Drift (Perpendicular Curvature)
      if (p.curveDrift) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 2) {
          p.vx += (-p.vy / sp) * p.curveDrift * dtSec;
          p.vy += (p.vx / sp) * p.curveDrift * dtSec;
        }
      }

      // 4. Spiral Velocity Modulation (Tangential & Radial Trajectories)
      if (p.spiralSpeed) {
        applySpiralMovement(p, dtSec, age);
      }

      // 5. Gentle Wandering / Floating Drift
      if (p.wander) {
        p.vx += (Math.sin(age * 0.009 + p.bornAt * 0.01) - 0.1) * p.wander * dtSec;
        p.vy += (Math.cos(age * 0.008 + p.bornAt * 0.01) - 0.4) * p.wander * dtSec;
      }

      // 6. Drag & Friction
      if (p.drag) {
        const d = Math.pow(Math.max(0, 1 - p.drag), dtSec * 60);
        p.vx *= d;
        p.vy *= d;
      } else if (p.friction) {
        const f = Math.pow(p.friction, dtSec * 60);
        p.vx *= f;
        p.vy *= f;
      }

      // 7. Gravity
      if (p.gravity) {
        p.vy += p.gravity * dtSec;
      }

      // 8. Orbiting Revolution vs Standard Linear Translation
      if (p.orbitCenterX !== undefined && p.orbitCenterY !== undefined && p.orbitSpeed) {
        applyOrbitMovement(p, dtSec);
      } else {
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
      }

      // 9. Expanding / Contracting Ring Radius
      if (p.ringRadius !== undefined) {
        const maxR = p.ringMaxRadius !== undefined ? p.ringMaxRadius : 24;
        p.ringRadius += (maxR - p.ringRadius) * Math.min(1, dtSec * 7);
      }

      // 10. Angular Velocity & Rotation
      if (p.angularVelocity) {
        p.rotation = (p.rotation || 0) + p.angularVelocity * dtSec;
      }

      // --- Transverse Wave-like Displacement ---
      let renderX = p.x;
      let renderY = p.y;
      if (p.waveAmplitude && p.waveFrequency) {
        const wAng = (age * 0.001 * p.waveFrequency * Math.PI * 2) + (p.wavePhase || 0);
        const wVal = Math.sin(wAng) * p.waveAmplitude;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 2) {
          renderX += (-p.vy / sp) * wVal;
          renderY += (p.vx / sp) * wVal;
        } else {
          renderX += wVal;
        }
      }

      // --- Visual Properties & Curves ---

      // Alpha Curve Calculation
      let alpha = 1.0;
      if (p.fadeInRatio && progress < p.fadeInRatio) {
        const ramp = progress / p.fadeInRatio;
        alpha = ramp * (p.alphaStart !== undefined ? p.alphaStart : 1.0);
      } else {
        const aStart = p.alphaStart !== undefined ? p.alphaStart : 1.0;
        const aEnd = p.alphaEnd !== undefined ? p.alphaEnd : 0.0;
        const t = p.alphaCurve === 'easeIn'
          ? progress * progress
          : p.alphaCurve === 'easeOut'
            ? 1 - Math.pow(1 - progress, 2)
            : progress;
        alpha = aStart + (aEnd - aStart) * t;
      }

      if (p.alphaCurve === 'pulse' || p.pulseRate) {
        const rate = p.pulseRate || 0.015;
        alpha *= (0.7 + 0.3 * Math.sin(age * rate));
      }

      if (p.flicker && Math.sin(age * 0.04 + p.bornAt) < -0.35) {
        alpha *= 0.35;
      }
      alpha = Math.max(0, Math.min(1, alpha));

      // Scale Curve Calculation
      const sStart = p.startScale !== undefined ? p.startScale : 1.0;
      const sEnd = p.endScale !== undefined ? p.endScale : 0.55;
      let scaleMultiplier = 1.0;
      if (p.scaleCurve === 'easeOut') {
        const t = 1 - Math.pow(1 - progress, 2);
        scaleMultiplier = sStart + (sEnd - sStart) * t;
      } else if (p.scaleCurve === 'easeIn') {
        const t = progress * progress;
        scaleMultiplier = sStart + (sEnd - sStart) * t;
      } else if (p.scaleCurve === 'pulse') {
        scaleMultiplier = (sStart + (sEnd - sStart) * progress) * (1 + 0.25 * Math.sin(age * 0.02));
      } else {
        scaleMultiplier = sStart + (sEnd - sStart) * progress;
      }
      const curSize = Math.max(0.5, p.size * scaleMultiplier);

      // Color Transition Over Lifetime
      let drawColor = p.color;
      if (p.colorEnd) {
        const c1 = parseRgb(p.color);
        const c2 = parseRgb(p.colorEnd);
        drawColor = interpolateColorRgb(c1, c2, progress);
      }

      // Velocity Stretch & Orientation
      let rot = p.rotation || 0;
      let stretchX = 1.0;
      if (p.stretchWithVelocity) {
        rot = Math.atan2(p.vy, p.vx);
        const sp = Math.hypot(p.vx, p.vy);
        stretchX = 1 + sp * (p.stretchFactor || 0.006);
      }

      // --- Context Setup ---
      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.blendMode) {
        ctx.globalCompositeOperation = p.blendMode;
      }

      if (p.glow) {
        ctx.shadowColor = drawColor;
        ctx.shadowBlur = Math.min(8, p.glowBlur || 4);
      }

      ctx.fillStyle = drawColor;
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = 1;

      const px = Math.round(renderX);
      const py = Math.round(renderY);

      ctx.translate(px, py);
      if (rot !== 0) ctx.rotate(rot);
      if (stretchX !== 1) ctx.scale(stretchX, 1);

      // --- Procedural Pixel-Art Shape Drawing ---
      const shape = p.shape || 'square';
      drawParticleShape(ctx, shape, curSize, drawColor, p, now);

      ctx.restore();

      // Compact in-place without array reallocation
      list[writeIdx++] = p;
    }

    list.length = writeIdx;
  }
}

const slashSheetCache: Record<string, HTMLImageElement> = {};

function getSlashSheet(filename: string): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  if (!slashSheetCache[filename]) {
    const img = new Image();
    img.src = `/assets/slash_fx/${filename}`;
    slashSheetCache[filename] = img;
  }
  const img = slashSheetCache[filename];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Draws polished pixel-art combat projectiles with luminous cores, trails, and impact flares.
 */
export function drawEnhancedProjectile(
  ctx: CanvasRenderingContext2D,
  proj: ProjectileState,
  now: number
): void {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(proj.angle);

  if (proj.style === 'slash') {
    // Custom animated SlashFX sprite sheet extracted from user archive
    const isCrit = Boolean(proj.crit);
    const sheetFilename = isCrit
      ? 'slash_combo1.png'
      : (proj.id.charCodeAt(proj.id.length - 1) % 3 === 0)
        ? 'slash_simple1.png'
        : (proj.id.charCodeAt(proj.id.length - 1) % 3 === 1)
          ? 'slash_simple2.png'
          : 'slash_simple3.png';
    
    const totalFrames = isCrit ? 7 : 3;
    const sheetImg = getSlashSheet(sheetFilename);

    if (sheetImg) {
      const frameIdx = Math.floor((now * 0.024) % totalFrames);
      const drawSize = Math.max(56, proj.radius * 2.8);
      ctx.drawImage(
        sheetImg,
        frameIdx * 128,
        0,
        128,
        128,
        -drawSize / 2,
        -drawSize / 2,
        drawSize,
        drawSize
      );
    } else {
      // Vector fallback arc while sprite sheet loads
      const pulse = Math.sin(now * 0.02) * 2;
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + pulse, -0.9, 0.9);
      ctx.stroke();

      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 19 + pulse, -0.85, 0.85);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 19 + pulse, -0.7, 0.7);
      ctx.stroke();
    }

    if (isCrit) {
      // Subtle golden kinetic crescent aura behind critical slashes
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(22, proj.radius * 0.8), -0.85, 0.85);
      ctx.stroke();
    }

  } else if (proj.style === 'arrow') {
    if (proj.slowOnHit) {
      // Ranger Frost Volley: Crystalline frosted arrow with icy aura
      ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.fillRect(-13, -3.5, 29, 7);
      // Crystalline shaft
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(-10, -1.5, 18, 3);
      // Frosted diamond broadhead tip
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(8, -4, 6, 8);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(10, -2.5, 4, 5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(14, -1, 3, 2);
      // Icy cyan fletching
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(-11, -3.5, 4, 2);
      ctx.fillRect(-11, 1.5, 4, 2);
      // Frost wake streaks
      ctx.fillStyle = 'rgba(186, 230, 253, 0.65)';
      ctx.fillRect(-17, -0.5, 6, 1);
      ctx.fillRect(-21, -0.5, 3, 1);
    } else {
      // Sharp ironwood arrow with steel broadhead and emerald fletching
      ctx.fillStyle = '#92400E';
      ctx.fillRect(-10, -1.5, 18, 3);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(8, -3.5, 6, 7);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(10, -2, 4, 4);
      ctx.fillRect(14, -0.5, 2, 1);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(-11, -3.5, 4, 2);
      ctx.fillRect(-11, 1.5, 4, 2);
      ctx.fillStyle = '#059669';
      ctx.fillRect(-12, -4, 2, 1);
      ctx.fillRect(-12, 3, 2, 1);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.5)';
      ctx.fillRect(-16, -0.5, 5, 1);
      ctx.fillRect(-19, -0.5, 2, 1);
    }

  } else if (proj.style === 'arcane') {
    // Pulsating astral star with counter-rotating diamond rings
    const spin = now * 0.009;
    // Outer cosmic violet aura
    ctx.fillStyle = 'rgba(129, 140, 248, 0.24)';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    // Counter-rotating outer astral diamond frame
    ctx.save();
    ctx.rotate(-spin * 0.7);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-5.5, -5.5, 11, 11);
    ctx.restore();

    // Rotating diamond energy core
    ctx.save();
    ctx.rotate(spin);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.fillStyle = '#818CF8';
    ctx.fillRect(-6, -1, 12, 2);
    ctx.fillRect(-1, -6, 2, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();

    // Comet tail sparks
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-11, -1.5, 4, 3);
    ctx.fillStyle = '#C084FC';
    ctx.fillRect(-15, -1, 3, 2);

  } else if (proj.style === 'radiant') {
    // Solar sunburst cross projectile with rotating radiant glint rays
    const spin = now * 0.006;
    ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    // Rotating outer diagonal solar rays
    ctx.save();
    ctx.rotate(spin);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-6, -1, 12, 2);
    ctx.fillRect(-1, -6, 2, 12);
    ctx.restore();

    // Cardinal radiant sun cross
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-7.5, -2, 15, 4);
    ctx.fillRect(-2, -7.5, 4, 15);
    // Pure white solar core
    ctx.fillStyle = '#FEF9C3';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1.5, -1.5, 3, 3);

  } else if (proj.style === 'bone') {
    // Jagged whirling bone projectile
    const rSpin = now * 0.015;
    ctx.save();
    ctx.rotate(rSpin);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-8, -3, 16, 6);
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(-7, -2, 14, 4);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(-9, -4, 3, 8);
    ctx.fillRect(6, -4, 3, 8);
    ctx.restore();

  } else if (proj.style === 'voidorb') {
    // Abyssal singularity with gravitational distortion
    const pulse = Math.sin(now * 0.01) * 1.5;
    ctx.fillStyle = 'rgba(126, 34, 206, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 8 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#581C87';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#7E22CE';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#C084FC';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-1, -1, 2, 2); // Black hole center

  } else {
    // Fireball: Molten core with blazing outer flames
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = '#F97316';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1, -1, 2, 2);

    // Trailing flame tongue
    const flicker = Math.sin(now * 0.03) * 2;
    ctx.fillStyle = '#F97316';
    ctx.fillRect(-11, -2 + flicker, 4, 4);
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-14, -1 - flicker, 3, 2);
  }

  ctx.restore();
}
