import type { EnemyKind, ProjectileState } from '../shared/types.ts';

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
  shape?: 'square' | 'circle' | 'spark' | 'star';
  glow?: boolean;
}

export interface ScreenShakeState {
  intensity: number;
  maxIntensity: number;
}

/**
 * Creates and updates combat particles and screen shake impulses.
 */
export class ParticleManager {
  private particles: CombatParticle[] = [];

  public get count(): number {
    return this.particles.length;
  }

  public clear(): void {
    this.particles = [];
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
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (isCrit ? 110 : 65) + Math.random() * (isCrit ? 180 : 110);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: isCrit ? '#FEF08A' : color,
        secondaryColor: isCrit ? '#F59E0B' : '#FFFFFF',
        size: isCrit ? 2.5 + Math.random() * 2 : 1.5 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: (isCrit ? 450 : 300) + Math.random() * 200,
        gravity: 120,
        friction: 0.92,
        shape: isCrit && i % 2 === 0 ? 'star' : 'spark',
        glow: isCrit,
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
    let shape: 'square' | 'circle' | 'spark' | 'star' = 'square';

    if (kind === 'slime') {
      baseColor = '#22C55E';
      secondaryColor = '#86EFAC';
      particleCount = 20;
      shape = 'circle';
    } else if (kind === 'goblin') {
      baseColor = '#65A30D';
      secondaryColor = '#CA8A04';
      particleCount = 16;
      shape = 'square';
    } else if (kind === 'skeleton') {
      baseColor = '#E2E8F0';
      secondaryColor = '#38BDF8';
      particleCount = 22;
      shape = 'spark';
    } else if (kind === 'cultist') {
      baseColor = '#7E22CE';
      secondaryColor = '#C084FC';
      particleCount = 24;
      shape = 'star';
    } else if (kind === 'knight') {
      baseColor = '#64748B';
      secondaryColor = '#F59E0B';
      particleCount = 26;
      shape = 'spark';
    } else if (kind === 'boss') {
      baseColor = '#EF4444';
      secondaryColor = '#FDE047';
      particleCount = 48;
      shape = 'star';
    }

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * (kind === 'boss' ? 240 : 150);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 25,
        color: i % 2 === 0 ? baseColor : secondaryColor,
        secondaryColor: '#FFFFFF',
        size: 2 + Math.random() * 2.5,
        bornAt: now,
        maxAgeMs: 400 + Math.random() * 350,
        gravity: 160,
        friction: 0.91,
        shape,
        glow: kind === 'boss' || kind === 'cultist',
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
      const dist = active ? 24 + Math.random() * 28 : 18 + Math.random() * 12;
      const targetSpeed = active ? -50 - Math.random() * 40 : 15;
      this.particles.push({
        x: px + Math.cos(angle) * dist,
        y: py + Math.sin(angle) * dist,
        vx: Math.cos(angle) * targetSpeed + (Math.random() - 0.5) * 10,
        vy: Math.sin(angle) * targetSpeed - 15,
        color: active ? (Math.random() > 0.5 ? '#38BDF8' : '#818CF8') : '#475569',
        secondaryColor: active ? '#E0F2FE' : '#1E293B',
        size: active ? 1.8 + Math.random() * 1.6 : 1.2,
        bornAt: now,
        maxAgeMs: active ? 650 : 450,
        friction: 0.94,
        shape: active ? 'star' : 'circle',
        glow: active,
      });
    }
  }

  public spawnShrineMotes(sx: number, sy: number, active: boolean, now: number): void {
    if (active && Math.random() < 0.3) {
      this.particles.push({
        x: sx + (Math.random() - 0.5) * 20,
        y: sy - 14 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -25 - Math.random() * 20,
        color: Math.random() > 0.4 ? '#34D399' : '#FDE047',
        secondaryColor: '#A7F3D0',
        size: 1.5 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 700 + Math.random() * 300,
        friction: 0.97,
        shape: 'spark',
        glow: true,
      });
    }
  }

  public spawnVaultGleam(vx: number, vy: number, active: boolean, now: number): void {
    if (active && Math.random() < 0.25) {
      this.particles.push({
        x: vx + (Math.random() - 0.5) * 24,
        y: vy - 8 + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 16,
        vy: -18 - Math.random() * 22,
        color: Math.random() > 0.5 ? '#FBBF24' : '#C084FC',
        secondaryColor: '#FEF08A',
        size: 1.8 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 600 + Math.random() * 250,
        friction: 0.96,
        shape: 'star',
        glow: true,
      });
    }
  }

  public spawnProjectileWake(proj: ProjectileState, now: number): void {
    if (Math.random() < 0.6) {
      let color = '#FDE68A';
      let size = 1.6;
      let shape: 'square' | 'circle' | 'spark' | 'star' = 'spark';

      if (proj.style === 'arcane') {
        color = Math.random() > 0.5 ? '#38BDF8' : '#818CF8';
        shape = 'star';
        size = 2;
      } else if (proj.style === 'radiant') {
        color = '#FDE047';
        shape = 'star';
        size = 2.2;
      } else if (proj.style === 'arrow') {
        color = '#CBD5E1';
        shape = 'spark';
        size = 1.2;
      } else if (proj.style === 'voidorb') {
        color = '#A855F7';
        shape = 'circle';
        size = 2;
      } else if (proj.style === 'fireball') {
        color = Math.random() > 0.5 ? '#F97316' : '#EF4444';
        shape = 'square';
        size = 2;
      }

      this.particles.push({
        x: proj.x + (Math.random() - 0.5) * 4,
        y: proj.y + (Math.random() - 0.5) * 4,
        vx: -Math.cos(proj.angle) * 35 + (Math.random() - 0.5) * 15,
        vy: -Math.sin(proj.angle) * 35 + (Math.random() - 0.5) * 15,
        color,
        size,
        bornAt: now,
        maxAgeMs: 220 + Math.random() * 120,
        shape,
        friction: 0.9,
      });
    }
  }

  public updateAndDraw(
    ctx: CanvasRenderingContext2D,
    now: number,
    dtSec: number
  ): void {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const age = now - p.bornAt;
      if (age >= p.maxAgeMs) {
        list.splice(i, 1);
        continue;
      }

      // Physics integration
      if (p.friction) {
        p.vx *= Math.pow(p.friction, dtSec * 60);
        p.vy *= Math.pow(p.friction, dtSec * 60);
      }
      if (p.gravity) {
        p.vy += p.gravity * dtSec;
      }
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      const progress = age / p.maxAgeMs;
      const alpha = Math.max(0, 1 - progress);
      const curSize = Math.max(0.5, p.size * (1 - progress * 0.45));

      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
      }

      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'star') {
        const sx = Math.round(p.x);
        const sy = Math.round(p.y);
        ctx.fillRect(sx - curSize, sy, curSize * 2, 1);
        ctx.fillRect(sx, sy - curSize, 1, curSize * 2);
      } else if (p.shape === 'spark') {
        const sx = Math.round(p.x);
        const sy = Math.round(p.y);
        ctx.fillRect(sx - curSize, sy - 0.5, curSize * 2, 1.2);
      } else {
        ctx.fillRect(
          Math.round(p.x - curSize / 2),
          Math.round(p.y - curSize / 2),
          Math.max(1, Math.round(curSize)),
          Math.max(1, Math.round(curSize))
        );
      }

      ctx.restore();
    }
  }
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
    // Crescent Sunforged Cleave Wave with inner heat gradient
    const pulse = Math.sin(now * 0.02) * 2;
    // Outer arc
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + pulse, -0.9, 0.9);
    ctx.stroke();

    // Core sharp blade arc
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 19 + pulse, -0.85, 0.85);
    ctx.stroke();

    // Razor-white cutting edge
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 19 + pulse, -0.7, 0.7);
    ctx.stroke();

    // Blade tip sparks
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(16, -12, 2, 2);
    ctx.fillRect(16, 11, 2, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(17, -11, 1, 1);
    ctx.fillRect(17, 10, 1, 1);

  } else if (proj.style === 'arrow') {
    // Sharp ironwood arrow with steel broadhead and fletching
    // Shaft
    ctx.fillStyle = '#92400E';
    ctx.fillRect(-10, -1.5, 18, 3);
    // Steel broadhead tip
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(8, -3.5, 6, 7);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(10, -2, 4, 4);
    ctx.fillRect(14, -0.5, 2, 1);
    // Green fletching feathers
    ctx.fillStyle = '#34D399';
    ctx.fillRect(-11, -3.5, 4, 2);
    ctx.fillRect(-11, 1.5, 4, 2);
    ctx.fillStyle = '#059669';
    ctx.fillRect(-12, -4, 2, 1);
    ctx.fillRect(-12, 3, 2, 1);
    // Speed wake streaks behind arrow
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(-16, -0.5, 5, 1);
    ctx.fillRect(-19, -0.5, 2, 1);

  } else if (proj.style === 'arcane') {
    // Pulsating astral star with orbiting starlight ring
    const spin = now * 0.008;
    // Outer astral aura
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fillRect(-8, -8, 16, 16);

    // Rotating diamond energy core
    ctx.save();
    ctx.rotate(spin);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#818CF8';
    ctx.fillRect(-6, -1, 12, 2);
    ctx.fillRect(-1, -6, 2, 12);
    // Brilliant white starlight center
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();

    // Comet tail sparks
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-10, -2, 4, 4);
    ctx.fillStyle = '#BAE6FD';
    ctx.fillRect(-14, -1, 3, 2);

  } else if (proj.style === 'radiant') {
    // Solar sunburst cross projectile with radiant glint
    ctx.fillStyle = 'rgba(250, 204, 21, 0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    // Radiant sun cross
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-7, -2, 14, 4);
    ctx.fillRect(-2, -7, 4, 14);
    // Pure white solar core
    ctx.fillStyle = '#FEF9C3';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1, -1, 2, 2);

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
