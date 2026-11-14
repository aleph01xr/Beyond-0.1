import {
  computePlayerMoveSpeed,
  hasMovementInput,
  stepPlayerMovement,
} from '../shared/playerMovement.ts';
import type {
  DungeonMap,
  PlayerInputState,
  PlayerState,
  PropState,
} from '../shared/types.ts';

export interface PredictedMoveStep {
  seq: number;
  input: PlayerInputState;
  dtSec: number;
}

export interface PredictionStepResult {
  x: number;
  y: number;
  reconciledErrorPx: number;
  snapped: boolean;
}

const MIN_BLEND_ERROR_PX = 1.5;
const HARD_SNAP_ERROR_PX = 48;
const ERROR_DECAY_RATE = 16;
const MAX_PENDING_STEPS = 45;

/**
 * Deterministic client-side movement predictor with server reconciliation.
 * Runs the exact same collision & speed rules as the server every render frame
 * for zero-delay local movement feel while keeping the server authoritative.
 */
export class LocalPredictionController {
  private initialized = false;
  private lastFloor = -999;
  private lastPlayerId = '';
  private predX = 0;
  private predY = 0;
  private predVx = 0;
  private predVy = 0;
  private errorOffsetX = 0;
  private errorOffsetY = 0;
  private pendingSteps: PredictedMoveStep[] = [];

  public reset(): void {
    this.initialized = false;
    this.lastFloor = -999;
    this.lastPlayerId = '';
    this.predX = 0;
    this.predY = 0;
    this.predVx = 0;
    this.predVy = 0;
    this.errorOffsetX = 0;
    this.errorOffsetY = 0;
    this.pendingSteps.length = 0;
  }

  public getPosition(): { x: number; y: number } | null {
    if (!this.initialized) return null;
    return {
      x: this.predX + this.errorOffsetX,
      y: this.predY + this.errorOffsetY,
    };
  }

  public getPendingCount(): number {
    return this.pendingSteps.length;
  }

  public step(params: {
    me: PlayerState;
    liveInput: PlayerInputState;
    latestSentSeq: number;
    map: DungeonMap;
    props: readonly PropState[];
    npcs?: readonly { x: number; y: number }[];
    dtSec: number;
    nowMs: number;
    isNewSnapshot: boolean;
    oneWayLatencySec?: number;
  }): PredictionStepResult {
    const {
      me,
      liveInput,
      latestSentSeq,
      map,
      props,
      npcs,
      dtSec,
      nowMs,
      isNewSnapshot,
      oneWayLatencySec = 0.015,
    } = params;

    if (
      !this.initialized ||
      me.downed ||
      this.lastFloor !== map.floor ||
      this.lastPlayerId !== me.id
    ) {
      this.initialized = true;
      this.lastFloor = map.floor;
      this.lastPlayerId = me.id;
      this.predX = me.x;
      this.predY = me.y;
      this.predVx = me.vx;
      this.predVy = me.vy;
      this.errorOffsetX = 0;
      this.errorOffsetY = 0;
      this.pendingSteps.length = 0;
      return {
        x: this.predX,
        y: this.predY,
        reconciledErrorPx: 0,
        snapped: true,
      };
    }

    const moveSpeed = computePlayerMoveSpeed(me);
    const isDisoriented = Boolean(
      me.statuses && me.statuses.some((s) => s.type === 'disoriented')
    );
    const isCharmed = Boolean(
      me.statuses && me.statuses.some((s) => s.type === 'charmed')
    );

    let reconciledErrorPx = 0;
    let snapped = false;

    if (isNewSnapshot) {
      const ackSeq = me.lastInputSeq ?? 0;

      // Discard frames whose input sequence the server has already processed
      let dropCount = 0;
      while (
        dropCount < this.pendingSteps.length &&
        this.pendingSteps[dropCount].seq <= ackSeq
      ) {
        dropCount++;
      }
      if (dropCount > 0) {
        this.pendingSteps.splice(0, dropCount);
      }

      const reconciled = {
        x: me.x,
        y: me.y,
        vx: me.vx,
        vy: me.vy,
      };

      if (!isCharmed) {
        if (this.pendingSteps.length > 0) {
          for (let i = 0; i < this.pendingSteps.length; i++) {
            const st = this.pendingSteps[i];
            stepPlayerMovement(reconciled, st.input, map, props, st.dtSec, {
              moveSpeed,
              disoriented: isDisoriented,
              timeMs: nowMs,
              npcs,
            });
          }
        } else if (
          hasMovementInput(liveInput) &&
          (Math.hypot(me.vx, me.vy) > 5 || ackSeq >= latestSentSeq)
        ) {
          const leadSec = Math.min(0.12, Math.max(0.01, oneWayLatencySec + 0.015));
          stepPlayerMovement(reconciled, liveInput, map, props, leadSec, {
            moveSpeed,
            disoriented: isDisoriented,
            timeMs: nowMs,
            npcs,
          });
        }
      }

      const errX = reconciled.x - this.predX;
      const errY = reconciled.y - this.predY;
      reconciledErrorPx = Math.hypot(errX, errY);

      if (reconciledErrorPx > HARD_SNAP_ERROR_PX || isCharmed) {
        // Dash, teleport, large knockback, or Siren pull: snap cleanly to authoritative position
        this.predX = reconciled.x;
        this.predY = reconciled.y;
        this.predVx = reconciled.vx;
        this.predVy = reconciled.vy;
        this.errorOffsetX = 0;
        this.errorOffsetY = 0;
        this.pendingSteps.length = 0;
        snapped = true;
      } else {
        const prevVisualX = this.predX + this.errorOffsetX;
        const prevVisualY = this.predY + this.errorOffsetY;
        this.predX = reconciled.x;
        this.predY = reconciled.y;
        if (reconciledErrorPx > MIN_BLEND_ERROR_PX) {
          // Preserve visual continuity and bleed correction out smoothly
          this.errorOffsetX = prevVisualX - this.predX;
          this.errorOffsetY = prevVisualY - this.predY;
        }
      }
    }

    // Advance prediction for the current render frame immediately
    if (!isCharmed && dtSec > 0) {
      const simEntity = {
        x: this.predX,
        y: this.predY,
        vx: this.predVx,
        vy: this.predVy,
      };
      const moving = hasMovementInput(liveInput);
      stepPlayerMovement(simEntity, liveInput, map, props, dtSec, {
        moveSpeed,
        disoriented: isDisoriented,
        timeMs: nowMs,
        npcs,
      });
      this.predX = simEntity.x;
      this.predY = simEntity.y;
      this.predVx = simEntity.vx;
      this.predVy = simEntity.vy;

      if (moving || latestSentSeq > (me.lastInputSeq ?? 0)) {
        this.pendingSteps.push({
          seq: latestSentSeq,
          input: {
            up: Boolean(liveInput.up),
            down: Boolean(liveInput.down),
            left: Boolean(liveInput.left),
            right: Boolean(liveInput.right),
            attack: Boolean(liveInput.attack),
            aimAngle: liveInput.aimAngle,
            stickX: liveInput.stickX,
            stickY: liveInput.stickY,
          },
          dtSec,
        });
        if (this.pendingSteps.length > MAX_PENDING_STEPS) {
          this.pendingSteps.shift();
        }
      }
    }

    // Exponentially decay any visual reconciliation offset
    if (dtSec > 0 && (this.errorOffsetX !== 0 || this.errorOffsetY !== 0)) {
      const decay = Math.exp(-ERROR_DECAY_RATE * dtSec);
      this.errorOffsetX *= decay;
      this.errorOffsetY *= decay;
      if (Math.abs(this.errorOffsetX) < 0.15) this.errorOffsetX = 0;
      if (Math.abs(this.errorOffsetY) < 0.15) this.errorOffsetY = 0;
    }

    return {
      x: this.predX + this.errorOffsetX,
      y: this.predY + this.errorOffsetY,
      reconciledErrorPx,
      snapped,
    };
  }
}
