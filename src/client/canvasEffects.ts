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
  shape?: 'square' | 'circle' | 'spark' | 'star' | 'slash';
  glow?: boolean;
  rot?: number;
  rotSpeed?: number;
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
      const speed = (isCrit ? 120 : 70) + Math.random() * (isCrit ? 200 : 120);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: isCrit ? '#FEF08A' : color,
        secondaryColor: isCrit ? '#F59E0B' : '#FFFFFF',
        size: isCrit ? 2.6 + Math.random() * 2.2 : 1.6 + Math.random() * 1.6,
        bornAt: now,
        maxAgeMs: (isCrit ? 480 : 320) + Math.random() * 220,
        gravity: 130,
        friction: 0.91,
        shape: isCrit && i % 2 === 0 ? 'star' : 'spark',
        glow: isCrit,
      });
    }
  }

  /** Class-flavored impact burst */
  public spawnStyleHitBurst(
    x: number,
    y: number,
    style: ProjectileState['style'],
    isCrit: boolean = false,
    now: number = performance.now()
  ): void {
    let count = isCrit ? 14 : 8;
    let baseColor = '#FDE68A';
    let secondary = '#FFFFFF';
    let shape: CombatParticle['shape'] = 'spark';
    let gravity = 120;
    let speedBase = isCrit ? 130 : 75;

    if (style === 'slash') {
      baseColor = isCrit ? '#FEF08A' : '#F59E0B';
      secondary = '#FFFFFF';
      shape = 'slash';
      count = isCrit ? 16 : 10;
      speedBase = isCrit ? 160 : 95;
      gravity = 80;
    } else if (style === 'arrow') {
      baseColor = isCrit ? '#A7F3D0' : '#34D399';
      secondary = '#ECFDF5';
      shape = 'spark';
      count = isCrit ? 12 : 7;
      speedBase = isCrit ? 180 : 110;
      gravity = 40;
    } else if (style === 'arcane') {
      baseColor = isCrit ? '#C4B5FD' : '#38BDF8';
      secondary = '#E0F2FE';
      shape = 'star';
      count = isCrit ? 18 : 11;
      speedBase = isCrit ? 140 : 85;
      gravity = 30;
    } else if (style === 'radiant') {
      baseColor = isCrit ? '#FEF9C3' : '#FACC15';
      secondary = '#FEF08A';
      shape = 'star';
      count = isCrit ? 16 : 10;
      speedBase = isCrit ? 120 : 70;
      gravity = 20;
    } else if (style === 'fireball') {
      baseColor = '#F97316';
      secondary = '#EF4444';
      shape = 'square';
      gravity = 60;
    } else if (style === 'voidorb') {
      baseColor = '#C084FC';
      secondary = '#581C87';
      shape = 'circle';
      gravity = -20;
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedBase + Math.random() * speedBase * 0.8;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: i % 3 === 0 ? secondary : baseColor,
        secondaryColor: secondary,
        size: isCrit ? 2.4 + Math.random() * 2.2 : 1.5 + Math.random() * 1.8,
        bornAt: now,
        maxAgeMs: (isCrit ? 420 : 280) + Math.random() * 200,
        gravity,
        friction: 0.90,
        shape,
        glow: true,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 12,
      });
    }
  }

  /** Muzzle / weapon flash when a hero starts an attack */
  public spawnAttackLaunchBurst(
    x: number,
    y: number,
    style: ProjectileState['style'],
    aimAngle: number,
    now: number = performance.now()
  ): void {
    const originX = x + Math.cos(aimAngle) * 18;
    const originY = y + Math.sin(aimAngle) * 18;

    if (style === 'slash') {
      for (let i = 0; i < 10; i++) {
        const spread = aimAngle + (Math.random() - 0.5) * 1.4;
        const speed = 90 + Math.random() * 140;
        this.particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(spread) * speed,
          vy: Math.sin(spread) * speed,
          color: i % 2 === 0 ? '#F59E0B' : '#FEF08A',
          secondaryColor: '#FFFFFF',
          size: 2.0 + Math.random() * 2.2,
          bornAt: now,
          maxAgeMs: 220 + Math.random() * 160,
          friction: 0.88,
          shape: 'slash',
          glow: true,
          gravity: 40,
        });
      }
    } else if (style === 'arrow') {
      for (let i = 0; i < 7; i++) {
        const spread = aimAngle + (Math.random() - 0.5) * 0.35;
        const speed = 160 + Math.random() * 120;
        this.particles.push({
          x: originX + (Math.random() - 0.5) * 4,
          y: originY + (Math.random() - 0.5) * 4,
          vx: Math.cos(spread) * speed,
          vy: Math.sin(spread) * speed,
          color: i % 2 === 0 ? '#34D399' : '#A7F3D0',
          size: 1.4 + Math.random() * 1.4,
          bornAt: now,
          maxAgeMs: 180 + Math.random() * 120,
          friction: 0.86,
          shape: 'spark',
          glow: true,
          gravity: 10,
        });
      }
    } else if (style === 'arcane') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.2;
        const speed = 70 + Math.random() * 90;
        this.particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          color: i % 2 === 0 ? '#38BDF8' : '#818CF8',
          secondaryColor: '#E0F2FE',
          size: 1.8 + Math.random() * 1.8,
          bornAt: now,
          maxAgeMs: 280 + Math.random() * 180,
          friction: 0.91,
          shape: 'star',
          glow: true,
          gravity: -15,
        });
      }
    } else if (style === 'radiant') {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const speed = 55 + Math.random() * 70;
        this.particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          color: i % 2 === 0 ? '#FACC15' : '#FEF08A',
          secondaryColor: '#FFFFFF',
          size: 2.0 + Math.random() * 1.6,
          bornAt: now,
          maxAgeMs: 320 + Math.random() * 200,
          friction: 0.93,
          shape: 'star',
          glow: true,
          gravity: -10,
        });
      }
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
    let shape: CombatParticle['shape'] = 'square';

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

  public spawnPortalWisps(px: number, py: number, active: boolean, now: number): void {
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

  public spawnBossShieldSparks(bx: number, by: number, now: number): void {
    if (Math.random() < 0.45) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x: bx + Math.cos(angle) * 32,
        y: by + Math.sin(angle) * 32,
        vx: Math.cos(angle) * 45 + (Math.random() - 0.5) * 20,
        vy: Math.sin(angle) * 45 - 20,
        color: Math.random() > 0.5 ? '#60A5FA' : '#93C5FD',
        secondaryColor: '#FFFFFF',
        size: 1.8 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 350 + Math.random() * 200,
        friction: 0.92,
        shape: 'spark',
        glow: true,
      });
    }
  }

  public spawnFrostNovaMotes(fx: number, fy: number, radius: number, now: number): void {
    if (Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.particles.push({
        x: fx + Math.cos(a) * r,
        y: fy + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 15,
        vy: -25 - Math.random() * 25,
        color: Math.random() > 0.5 ? '#38BDF8' : '#BAE6FD',
        secondaryColor: '#E0F2FE',
        size: 1.6 + Math.random() * 1.6,
        bornAt: now,
        maxAgeMs: 500 + Math.random() * 250,
        friction: 0.95,
        shape: 'star',
        glow: true,
      });
    }
  }

  public spawnMagmaEmbers(mx: number, my: number, radius: number, now: number): void {
    if (Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;
      this.particles.push({
        x: mx + Math.cos(a) * r,
        y: my + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 20,
        vy: -35 - Math.random() * 35,
        color: Math.random() > 0.5 ? '#F97316' : '#EF4444',
        secondaryColor: '#FEF08A',
        size: 2.0 + Math.random() * 1.8,
        bornAt: now,
        maxAgeMs: 550 + Math.random() * 300,
        gravity: -20,
        friction: 0.94,
        shape: 'square',
        glow: true,
      });
    }
  }

  public spawnSingularityInwardWisps(sx: number, sy: number, radius: number, now: number): void {
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      const dist = radius + 20 + Math.random() * 30;
      this.particles.push({
        x: sx + Math.cos(a) * dist,
        y: sy + Math.sin(a) * dist,
        vx: -Math.cos(a) * 75,
        vy: -Math.sin(a) * 75,
        color: Math.random() > 0.5 ? '#C084FC' : '#E879F9',
        secondaryColor: '#581C87',
        size: 2.2 + Math.random() * 1.5,
        bornAt: now,
        maxAgeMs: 450 + Math.random() * 200,
        friction: 0.93,
        shape: 'star',
        glow: true,
      });
    }
  }

  public spawnSupernovaGlints(sx: number, sy: number, radius: number, now: number): void {
    if (Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: sx + Math.cos(a) * radius,
        y: sy + Math.sin(a) * radius,
        vx: Math.cos(a) * 40 + (Math.random() - 0.5) * 15,
        vy: Math.sin(a) * 40 + (Math.random() - 0.5) * 15,
        color: Math.random() > 0.5 ? '#F472B6' : '#38BDF8',
        secondaryColor: '#FFFFFF',
        size: 2.2 + Math.random() * 1.8,
        bornAt: now,
        maxAgeMs: 400 + Math.random() * 200,
        friction: 0.91,
        shape: 'star',
        glow: true,
      });
    }
  }

  public spawnBossEnrageBurst(bx: number, by: number, now: number): void {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + (Math.random() - 0.5) * 0.2;
      const speed = 75 + Math.random() * 85;
      this.particles.push({
        x: bx,
        y: by,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 15,
        color: i % 2 === 0 ? '#EF4444' : '#FDE047',
        secondaryColor: '#F97316',
        size: 1.8 + Math.random() * 1.2,
        bornAt: now,
        maxAgeMs: 320 + Math.random() * 180,
        gravity: 40,
        friction: 0.92,
        shape: 'star',
        glow: true,
      });
    }
  }

  public spawnCleaveShockwaveSparks(x: number, y: number, angle: number, now: number): void {
    for (let i = 0; i < 8; i++) {
      const spread = angle + (Math.random() - 0.5) * 0.7;
      const speed = 150 + Math.random() * 130;
      this.particles.push({
        x,
        y,
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        color: Math.random() > 0.5 ? '#F59E0B' : '#FEF08A',
        secondaryColor: '#FFFFFF',
        size: 2.1 + Math.random() * 1.6,
        bornAt: now,
        maxAgeMs: 260 + Math.random() * 160,
        friction: 0.89,
        shape: 'slash',
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
    const chance =
      proj.style === 'arrow' ? 0.85 :
      proj.style === 'slash' ? 0.55 :
      proj.style === 'arcane' ? 0.75 :
      proj.style === 'radiant' ? 0.7 :
      0.55;

    if (Math.random() > chance) return;

    let color = '#FDE68A';
    let size = 1.6;
    let shape: CombatParticle['shape'] = 'spark';
    let life = 200;
    let backSpeed = 40;
    let gravity = 0;

    if (proj.style === 'slash') {
      color = Math.random() > 0.4 ? '#F59E0B' : '#FEF08A';
      shape = 'slash';
      size = 2.2 + Math.random() * 1.4;
      life = 160 + Math.random() * 100;
      backSpeed = 55;
    } else if (proj.style === 'arrow') {
      color = Math.random() > 0.5 ? '#34D399' : '#A7F3D0';
      shape = 'spark';
      size = 1.1 + Math.random() * 0.9;
      life = 140 + Math.random() * 80;
      backSpeed = 70;
      gravity = 15;
    } else if (proj.style === 'arcane') {
      color = Math.random() > 0.5 ? '#38BDF8' : '#818CF8';
      shape = 'star';
      size = 1.9 + Math.random() * 1.4;
      life = 260 + Math.random() * 140;
      backSpeed = 45;
      gravity = -8;
    } else if (proj.style === 'radiant') {
      color = Math.random() > 0.5 ? '#FACC15' : '#FEF08A';
      shape = 'star';
      size = 2.0 + Math.random() * 1.3;
      life = 240 + Math.random() * 130;
      backSpeed = 35;
      gravity = -12;
    } else if (proj.style === 'voidorb') {
      color = '#A855F7';
      shape = 'circle';
      size = 2.1;
      life = 280;
      backSpeed = 30;
    } else if (proj.style === 'fireball') {
      color = Math.random() > 0.5 ? '#F97316' : '#EF4444';
      shape = 'square';
      size = 2.2;
      life = 220;
      backSpeed = 50;
      gravity = -25;
    }

    this.particles.push({
      x: proj.x + (Math.random() - 0.5) * 5,
      y: proj.y + (Math.random() - 0.5) * 5,
      vx: -Math.cos(proj.angle) * backSpeed + (Math.random() - 0.5) * 18,
      vy: -Math.sin(proj.angle) * backSpeed + (Math.random() - 0.5) * 18,
      color,
      size,
      bornAt: now,
      maxAgeMs: life,
      shape,
      friction: 0.88,
      gravity,
      glow: true,
    });
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

      if (p.friction) {
        p.vx *= Math.pow(p.friction, dtSec * 60);
        p.vy *= Math.pow(p.friction, dtSec * 60);
      }
      if (p.gravity) {
        p.vy += p.gravity * dtSec;
      }
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      if (p.rotSpeed) {
        p.rot = (p.rot || 0) + p.rotSpeed * dtSec;
      }

      const progress = age / p.maxAgeMs;
      const alpha = Math.max(0, 1 - progress);
      const curSize = Math.max(0.4, p.size * (1 - progress * 0.5));

      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 5;
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
        if (curSize > 1.5) {
          ctx.fillRect(sx - curSize * 0.7, sy - curSize * 0.7, 1, 1);
          ctx.fillRect(sx + curSize * 0.7, sy - curSize * 0.7, 1, 1);
          ctx.fillRect(sx - curSize * 0.7, sy + curSize * 0.7, 1, 1);
          ctx.fillRect(sx + curSize * 0.7, sy + curSize * 0.7, 1, 1);
        }
      } else if (p.shape === 'spark') {
        const sx = Math.round(p.x);
        const sy = Math.round(p.y);
        ctx.fillRect(sx - curSize, sy - 0.5, curSize * 2, 1.3);
      } else if (p.shape === 'slash') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-curSize * 1.4, -0.7, curSize * 2.8, 1.5);
        ctx.restore();
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
 * Draws polished combat projectiles. Each style is exaggerated so classes read instantly.
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
    const lifeT = Math.max(0, Math.min(1, proj.ttlMs / 260));
    const expand = 1 + (1 - lifeT) * 0.55;
    const pulse = Math.sin(now * 0.025) * 1.5;

    ctx.strokeStyle = `rgba(245, 158, 11, ${0.25 * lifeT})`;
    ctx.lineWidth = 10 * expand;
    ctx.beginPath();
    ctx.arc(0, 0, 22 * expand + pulse, -1.05, 1.05);
    ctx.stroke();

    ctx.strokeStyle = `rgba(253, 224, 71, ${0.55 * lifeT})`;
    ctx.lineWidth = 5.5 * expand;
    ctx.beginPath();
    ctx.arc(0, 0, 20 * expand + pulse * 0.6, -0.95, 0.95);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * lifeT})`;
    ctx.lineWidth = 2.4 * expand;
    ctx.beginPath();
    ctx.arc(0, 0, 19 * expand, -0.8, 0.8);
    ctx.stroke();

    const tipAlpha = lifeT * 0.9;
    ctx.fillStyle = `rgba(253, 224, 71, ${tipAlpha})`;
    ctx.fillRect(17 * expand, -14, 3, 3);
    ctx.fillRect(17 * expand, 12, 3, 3);
    ctx.fillStyle = `rgba(255, 255, 255, ${tipAlpha})`;
    ctx.fillRect(18 * expand, -13, 2, 2);
    ctx.fillRect(18 * expand, 13, 2, 2);

  } else if (proj.style === 'arrow') {
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-14, -1.4, 24, 2.8);
    ctx.fillStyle = '#92400E';
    ctx.fillRect(-13, -1, 22, 2);

    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.lineTo(18, 0);
    ctx.lineTo(10, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(11, -2, 5, 4);

    ctx.fillStyle = '#059669';
    ctx.fillRect(-15, -4, 5, 2.2);
    ctx.fillRect(-15, 1.8, 5, 2.2);
    ctx.fillStyle = '#34D399';
    ctx.fillRect(-14, -3.5, 3.5, 1.4);
    ctx.fillRect(-14, 2.2, 3.5, 1.4);

    ctx.fillStyle = 'rgba(167, 243, 208, 0.55)';
    ctx.fillRect(-22, -0.7, 8, 1.4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(-26, -0.4, 5, 0.8);

  } else if (proj.style === 'arcane') {
    const spin = now * 0.012;
    const pulse = 1 + Math.sin(now * 0.02) * 0.18;

    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(spin);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-5.5 * pulse, -5.5 * pulse, 11 * pulse, 11 * pulse);
    ctx.fillStyle = '#818CF8';
    ctx.fillRect(-7 * pulse, -1.5, 14 * pulse, 3);
    ctx.fillRect(-1.5, -7 * pulse, 3, 14 * pulse);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const oa = spin * 1.6 + (i * Math.PI * 2) / 3;
      const ox = Math.cos(oa) * 10;
      const oy = Math.sin(oa) * 10;
      ctx.fillStyle = i % 2 === 0 ? '#BAE6FD' : '#C4B5FD';
      ctx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
    }

    ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.fillRect(-12, -2.5, 6, 5);
    ctx.fillStyle = 'rgba(186, 230, 253, 0.5)';
    ctx.fillRect(-17, -1.5, 5, 3);

  } else if (proj.style === 'radiant') {
    const pulse = 1 + Math.sin(now * 0.018) * 0.15;

    ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
    ctx.beginPath();
    ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(253, 224, 71, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 9 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-7 * pulse, -7 * pulse, 14 * pulse, 14 * pulse);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-8 * pulse, -2.5, 16 * pulse, 5);
    ctx.fillRect(-2.5, -8 * pulse, 5, 16 * pulse);

    ctx.fillStyle = '#FEF9C3';
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1.5, -1.5, 3, 3);

    const moteA = now * 0.01;
    for (let i = 0; i < 2; i++) {
      const ma = moteA + i * Math.PI;
      ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
      ctx.fillRect(Math.cos(ma) * 12 - 1, Math.sin(ma) * 12 - 1, 2, 2);
    }

  } else if (proj.style === 'bone') {
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
    ctx.fillRect(-1, -1, 2, 2);

  } else {
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

    const flicker = Math.sin(now * 0.03) * 2;
    ctx.fillStyle = '#F97316';
    ctx.fillRect(-11, -2 + flicker, 4, 4);
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-14, -1 - flicker, 3, 2);
  }

  ctx.restore();
}

/**
 * Temporary wide cleave arc drawn at the hero while attackAnim is active.
 */
export function drawVanguardSwingArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aimAngle: number,
  attackAnimMs: number,
  now: number
): void {
  if (attackAnimMs <= 0) return;

  const t = Math.min(1, attackAnimMs / 190);
  const alpha = t * 0.85;
  const radius = 38 + (1 - t) * 22;
  const sweep = 1.1 + (1 - t) * 0.35;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aimAngle);
  ctx.globalAlpha = alpha;

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -sweep, sweep);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 2, -sweep * 0.9, sweep * 0.9);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 4, -sweep * 0.75, sweep * 0.75);
  ctx.stroke();

  ctx.restore();
}
