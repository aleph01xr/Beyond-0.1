import type { NpcState, EnemyState } from '../shared/types.ts';

/**
 * Beyond — Distinctive NPC Visual Designs & Idle Animation System
 *
 * Implements handcrafted pixel-art rendering for:
 * 1. Innkeeper Bram: Warm, experienced tavernkeeper with apron, rolled sleeves, bushy mustache,
 *    key ring, tankard polishing idle loop, and natural breathing.
 * 2. Barkeeper Lena: Agile, stylish bartender with midnight blue vest, shoulder bar towel,
 *    auburn braided ponytail with bounce physics, counter wipe / flagon inspect idle loop.
 * 3. Veteran Jorah: Battle-hardened warrior with scarred face, notched steel pauldron,
 *    riveted brigandine, sheathed greatsword, cape flutter, and sword pommel rest idle loop.
 */

/**
 * Innkeeper Bram — Warm, welcoming, seasoned host of The Rusty Tankard.
 */
export function drawInnkeeperBram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  isSpeaking: boolean
): void {
  // 1. Idle Breathing & Speech Bob
  const talkBob = isSpeaking ? Math.sin(now * 0.02) * 2.2 : 0;
  const breathe = Math.sin(now * 0.0035 + x) * 1.5;
  const cy = y + breathe + talkBob;

  // 2. Idle Polishing Routine (8-second cycle)
  // 0s - 3.8s: Natural resting posture with hands at apron
  // 3.8s - 7.6s: Raises wooden ale tankard and polishes rim with cloth
  const polishCycleMs = 8000;
  const cycleTime = (now + x * 200) % polishCycleMs;
  const isPolishing = !isSpeaking && cycleTime >= 3500 && cycleTime <= 7500;
  const polishProgress = (cycleTime - 3500) / 4000;
  const polishCirc = Math.sin(now * 0.016);

  // 3. Natural Blinking (every ~4.2s for 140ms)
  const isBlinking = ((now + x * 150) % 4200) < 140;

  // --- Shadow ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y + 11, 12, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Conversational Aura Ring when speaking ---
  if (isSpeaking) {
    const auraPulse = Math.sin(now * 0.012) * 2.5;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(x, y + 11, 15 + auraPulse, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- Sturdy Work Boots & Trousers ---
  ctx.fillStyle = '#18181B'; // Dark sturdy boots
  ctx.fillRect(x - 6, cy + 9, 5, 4);
  ctx.fillRect(x + 2, cy + 9, 5, 4);
  ctx.fillStyle = '#27272A';
  ctx.fillRect(x - 7, cy + 11, 6, 2);
  ctx.fillRect(x + 2, cy + 11, 6, 2);

  // Heavy wool trousers
  ctx.fillStyle = '#292524';
  ctx.fillRect(x - 6, cy + 3, 5, 7);
  ctx.fillRect(x + 2, cy + 3, 5, 7);

  // --- Cream Linen Undershirt with Rolled Sleeves ---
  ctx.fillStyle = '#FEF3C7'; // Linen cream
  ctx.fillRect(x - 9, cy - 8, 18, 12);
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(x - 8, cy - 7, 16, 10);

  // Rolled sleeves on forearms
  ctx.fillStyle = '#D97706'; // Rolled fabric band
  ctx.fillRect(x - 11, cy - 3, 3, 3);
  ctx.fillRect(x + 8, cy - 3, 3, 3);
  // Sturdy forearms
  ctx.fillStyle = '#FCD34D';
  ctx.fillRect(x - 11, cy, 3, 4);
  ctx.fillRect(x + 8, cy, 3, 4);

  // --- Warm Chestnut Woolen Vest ---
  ctx.fillStyle = '#451A03'; // Deep chestnut
  ctx.fillRect(x - 8, cy - 8, 5, 11);
  ctx.fillRect(x + 3, cy - 8, 5, 11);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(x - 7, cy - 7, 3, 9);
  ctx.fillRect(x + 4, cy - 7, 3, 9);

  // Brass Vest Buttons
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 1, cy - 6, 2, 2);
  ctx.fillRect(x - 1, cy - 2, 2, 2);
  ctx.fillRect(x - 1, cy + 2, 2, 2);

  // --- Sturdy Leather Bartender Apron ---
  // Apron bib
  ctx.fillStyle = '#92400E'; // Heavy saddle leather
  ctx.fillRect(x - 5, cy - 6, 10, 6);
  ctx.fillStyle = '#B45309';
  ctx.fillRect(x - 4, cy - 5, 8, 5);

  // Apron brass grommets
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(x - 4, cy - 5, 1, 1);
  ctx.fillRect(x + 3, cy - 5, 1, 1);

  // Apron skirt (drapes over trousers)
  ctx.fillStyle = '#92400E';
  ctx.fillRect(x - 7, cy, 14, 9);
  ctx.fillStyle = '#B45309';
  ctx.fillRect(x - 6, cy + 1, 12, 7);

  // Apron front utility pocket with clean cloth peeking out
  ctx.fillStyle = '#78350F';
  ctx.fillRect(x - 3, cy + 2, 6, 4);
  ctx.fillStyle = '#FFFFFF'; // White folded bar rag
  ctx.fillRect(x - 2, cy + 1, 4, 2);

  // --- Leather Belt & Brass Key Ring ---
  ctx.fillStyle = '#29180C';
  ctx.fillRect(x - 8, cy, 16, 2);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 2, cy - 0.5, 4, 3); // Belt buckle

  // Brass Ring with 3 Tavern Keys at Right Hip (Sways with breath)
  const keySway = Math.sin(now * 0.005 + x) * 1.5;
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(x + 6, cy + 1, 3, 3); // Ring
  ctx.fillStyle = '#D97706';
  ctx.fillRect(x + 7 + keySway * 0.4, cy + 3, 2, 4); // Key 1
  ctx.fillRect(x + 5 - keySway * 0.3, cy + 3, 1.5, 5); // Key 2
  ctx.fillRect(x + 8 + keySway * 0.5, cy + 3, 1.5, 3.5); // Key 3

  // --- Hand & Polishing Animation ---
  if (isPolishing) {
    // Left hand holds wooden tankard at chest height
    const tankardX = x - 5;
    const tankardY = cy - 2;

    // Ale tankard body
    ctx.fillStyle = '#78350F';
    ctx.fillRect(tankardX - 3, tankardY - 4, 6, 7);
    ctx.fillStyle = '#92400E';
    ctx.fillRect(tankardX - 2, tankardY - 3, 4, 5);
    // Brass hoops
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(tankardX - 3, tankardY - 4, 6, 1);
    ctx.fillRect(tankardX - 3, tankardY + 2, 6, 1);
    // Foam rim
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(tankardX - 3, tankardY - 5, 6, 2);

    // Left hand holding tankard handle
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(tankardX - 5, tankardY - 2, 3, 3);

    // Right hand with polishing cloth rubbing in smooth circle
    const ragX = tankardX + polishCirc * 2.5;
    const ragY = tankardY - 4 + Math.cos(now * 0.016) * 1.5;
    ctx.fillStyle = '#F8FAFC'; // White polishing cloth
    ctx.fillRect(ragX - 1, ragY - 1, 4, 4);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(ragX, ragY, 2, 2);
    // Right hand holding rag
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(ragX + 2, ragY, 3, 3);

    // Occasional finish gleam
    if (polishProgress > 0.85) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(tankardX + 2, tankardY - 6, 2, 2);
    }
  } else if (isSpeaking) {
    // Warm conversational open hand gestures
    const armGest = Math.sin(now * 0.02) * 3;
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 11, cy - 2 + armGest, 4, 4); // Left hand open
    ctx.fillRect(x + 8, cy - 2 - armGest, 4, 4); // Right hand open
  } else {
    // Resting hands comfortably on apron sides
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 9, cy + 2, 3, 4);
    ctx.fillRect(x + 7, cy + 2, 3, 4);
  }

  // --- Head, Face, Beard & Mustache ---
  const headY = cy - 18;

  // Friendly rounded head base
  ctx.fillStyle = '#FCD34D'; // Warm skin
  ctx.fillRect(x - 5, headY, 10, 10);
  // Warm flushed cheeks
  ctx.fillStyle = '#F87171';
  ctx.fillRect(x - 5, headY + 5, 2, 2);
  ctx.fillRect(x + 3, headY + 5, 2, 2);

  // Receding Wavy Amber-Brown Hair with Silver Temples
  ctx.fillStyle = '#451A03';
  ctx.fillRect(x - 6, headY - 2, 12, 4); // Top hairline
  ctx.fillRect(x - 7, headY, 3, 8); // Left hair side
  ctx.fillRect(x + 4, headY, 3, 8); // Right hair side
  // Silver gray streaks at temples
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(x - 7, headY + 3, 2, 3);
  ctx.fillRect(x + 5, headY + 3, 2, 3);

  // Kind Brown Eyes & Blinking
  ctx.fillStyle = '#451A03';
  if (isBlinking) {
    ctx.fillRect(x - 4, headY + 3, 3, 1);
    ctx.fillRect(x + 1, headY + 3, 3, 1);
  } else {
    ctx.fillRect(x - 4, headY + 2.5, 3, 2.5);
    ctx.fillRect(x + 1, headY + 2.5, 3, 2.5);
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 3, headY + 2.5, 1, 1);
    ctx.fillRect(x + 2, headY + 2.5, 1, 1);
  }

  // Full Bushy Walrus Mustache
  ctx.fillStyle = '#78350F';
  ctx.fillRect(x - 5, headY + 6, 10, 3);
  ctx.fillStyle = '#5C3A21';
  ctx.fillRect(x - 4, headY + 5.5, 8, 2);
  // Mustache tips curling down
  ctx.fillRect(x - 6, headY + 7, 2, 2);
  ctx.fillRect(x + 4, headY + 7, 2, 2);

  // Neatly Trimmed Gray-Speckled Beard
  ctx.fillStyle = '#78350F';
  ctx.fillRect(x - 4, headY + 9, 8, 3);
  ctx.fillRect(x - 3, headY + 11, 6, 2);
  ctx.fillStyle = '#94A3B8'; // Silver specks
  ctx.fillRect(x - 2, headY + 10, 1.5, 1.5);
  ctx.fillRect(x + 1, headY + 10, 1.5, 1.5);

  // Animated Speaking Mouth behind mustache
  if (isSpeaking) {
    const mouthOpen = Math.sin(now * 0.035) > 0;
    ctx.fillStyle = '#1C1917';
    ctx.fillRect(x - 2, headY + 7.5, 4, mouthOpen ? 2.5 : 1);
  }
}

/**
 * Barkeeper Lena — Agile, poised meadmaster and tavern strategist.
 */
export function drawBarkeeperLena(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  isSpeaking: boolean
): void {
  // 1. Idle Breathing & Speech Bob
  const talkBob = isSpeaking ? Math.sin(now * 0.02) * 2.2 : 0;
  const breathe = Math.sin(now * 0.004 + x) * 1.4;
  const cy = y + breathe + talkBob;

  // 2. Idle Routine (7-second cycle)
  // 0s - 3.2s: Attentive posture scanning the room
  // 3.2s - 6.8s: Counter wipe motion with bar towel / inspecting crystal flagon
  const wipeCycleMs = 7000;
  const cycleTime = (now + x * 200) % wipeCycleMs;
  const isWiping = !isSpeaking && cycleTime >= 3000 && cycleTime <= 6500;
  const wipeSwing = Math.sin(now * 0.014) * 4;

  // 3. Natural Blinking & Looking Around
  const isBlinking = ((now + x * 150) % 3800) < 130;
  // Subtle eye glance left/right when scanning room
  const lookDir = Math.sin(now * 0.0018) > 0.4 ? 1 : Math.sin(now * 0.0018) < -0.4 ? -1 : 0;

  // 4. Dynamic Hair Sway Physics
  const ponytailSway = Math.sin(now * 0.0045 + x) * 2.5;

  // --- Shadow ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y + 11, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Speech Aura Ring ---
  if (isSpeaking) {
    const auraPulse = Math.sin(now * 0.012) * 2.5;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(x, y + 11, 14 + auraPulse, 5.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- High Auburn-Copper Braided Ponytail (Drawn behind head) ---
  ctx.fillStyle = '#991B1B'; // Deep auburn
  ctx.fillRect(x - 9 + ponytailSway * 0.4, cy - 20, 5, 5); // Hair base tie
  ctx.fillStyle = '#EA580C'; // Golden copper braid
  ctx.fillRect(x - 11 + ponytailSway * 0.7, cy - 18, 4, 6);
  ctx.fillRect(x - 13 + ponytailSway, cy - 14, 4, 7);
  ctx.fillRect(x - 14 + ponytailSway * 1.2, cy - 8, 3, 6);
  // Gold hair tie band
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 9 + ponytailSway * 0.4, cy - 19, 2, 3);
  ctx.fillRect(x - 14 + ponytailSway * 1.2, cy - 3, 2, 2);

  // --- Fitted Barmaid Boots & Dark Trousers ---
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x - 5, cy + 9, 4, 4);
  ctx.fillRect(x + 1, cy + 9, 4, 4);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(x - 6, cy + 11, 5, 2);
  ctx.fillRect(x + 1, cy + 11, 5, 2);

  // Dark fitted pants
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(x - 5, cy + 3, 4, 7);
  ctx.fillRect(x + 1, cy + 3, 4, 7);

  // --- Crisp White Folded Collar Shirt ---
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(x - 7, cy - 7, 14, 11);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(x - 6, cy - 6, 12, 9);

  // Rolled sleeves with leather forearm bracers
  ctx.fillStyle = '#78350F'; // Leather bracers
  ctx.fillRect(x - 9, cy - 1, 3, 4);
  ctx.fillRect(x + 6, cy - 1, 3, 4);
  ctx.fillStyle = '#F59E0B'; // Brass studs
  ctx.fillRect(x - 9, cy, 1, 2);
  ctx.fillRect(x + 8, cy, 1, 2);

  // --- Fitted Midnight-Blue Vest with Brass Buttons ---
  ctx.fillStyle = '#1E3A8A'; // Midnight blue
  ctx.fillRect(x - 6, cy - 7, 4, 11);
  ctx.fillRect(x + 2, cy - 7, 4, 11);
  ctx.fillStyle = '#2563EB';
  ctx.fillRect(x - 5, cy - 6, 2, 9);
  ctx.fillRect(x + 3, cy - 6, 2, 9);

  // Brass Buttons
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 0.5, cy - 5, 1.5, 1.5);
  ctx.fillRect(x - 0.5, cy - 2, 1.5, 1.5);
  ctx.fillRect(x - 0.5, cy + 1, 1.5, 1.5);

  // Leather corset belt
  ctx.fillStyle = '#311604';
  ctx.fillRect(x - 6, cy + 2, 12, 3);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(x - 1.5, cy + 2, 3, 3); // Buckle

  // --- Signature White Bar Towel Draped over Left Shoulder ---
  ctx.fillStyle = '#FFFFFF'; // Clean white towel
  ctx.fillRect(x - 8, cy - 8, 4, 13);
  ctx.fillStyle = '#E2E8F0'; // Shadow fold
  ctx.fillRect(x - 7, cy - 4, 2, 9);
  // Red woven stripe along towel border
  ctx.fillStyle = '#EF4444';
  ctx.fillRect(x - 8, cy + 3, 4, 1);

  // --- Hand Actions: Wiping Counter vs Resting vs Speaking ---
  if (isWiping) {
    // Right arm extending forward to wipe the counter
    const wipeHandX = x + 4 + wipeSwing;
    const wipeHandY = cy + 4;
    // Arm
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x + 4, cy + 1, 3, 3);
    // Hand holding small bar cloth
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(wipeHandX, wipeHandY - 1, 3, 3);
    ctx.fillStyle = '#F8FAFC'; // Cloth
    ctx.fillRect(wipeHandX - 1, wipeHandY + 1, 5, 3);

    // Left hand resting poised at hip
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 7, cy + 2, 3, 3);
  } else if (isSpeaking) {
    // Lively bartender advice hand gestures
    const armGest = Math.sin(now * 0.02) * 3;
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 8, cy - 1 + armGest, 3, 3);
    ctx.fillRect(x + 6, cy - 1 - armGest, 3, 3);
  } else {
    // Both hands resting poised at belt/hips
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 7, cy + 2, 3, 3);
    ctx.fillRect(x + 5, cy + 2, 3, 3);
  }

  // --- Head, Face, Hair Bangs & Silver Earring ---
  const headY = cy - 18;

  // Face
  ctx.fillStyle = '#FCD34D';
  ctx.fillRect(x - 4, headY, 9, 9);

  // Auburn Hair Volume & Side Bangs
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(x - 5, headY - 3, 11, 4); // Top hair
  ctx.fillStyle = '#C2410C';
  ctx.fillRect(x - 5, headY - 1, 3, 7); // Left swept bangs
  ctx.fillRect(x + 3, headY - 1, 3, 5); // Right swept hair

  // Piercing Emerald Eyes & Blinking
  ctx.fillStyle = '#064E3B';
  if (isBlinking) {
    ctx.fillRect(x - 3 + lookDir, headY + 3, 3, 1);
    ctx.fillRect(x + 1 + lookDir, headY + 3, 3, 1);
  } else {
    ctx.fillRect(x - 3 + lookDir, headY + 2, 2.5, 2.5);
    ctx.fillRect(x + 1 + lookDir, headY + 2, 2.5, 2.5);
    // Emerald iris
    ctx.fillStyle = '#10B981';
    ctx.fillRect(x - 2.5 + lookDir, headY + 2.5, 1.5, 1.5);
    ctx.fillRect(x + 1.5 + lookDir, headY + 2.5, 1.5, 1.5);
    // Pupil shine
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 2 + lookDir, headY + 2, 1, 1);
    ctx.fillRect(x + 2 + lookDir, headY + 2, 1, 1);
  }

  // Silver Hoop Earring at right ear
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(x + 5, headY + 4, 1.5, 2.5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x + 5, headY + 4, 1, 1); // Earring glint

  // Animated Speaking Mouth
  if (isSpeaking) {
    const mouthOpen = Math.sin(now * 0.035) > 0;
    ctx.fillStyle = '#18181B';
    ctx.fillRect(x - 1.5, headY + 6.5, 3.5, mouthOpen ? 2.5 : 1);
    // Subtle red lip color
    ctx.fillStyle = '#F87171';
    ctx.fillRect(x - 1, headY + 6, 2.5, 1);
  }
}

/**
 * Veteran Jorah — Seasoned warrior, scarred combat veteran, arena commander.
 */
export function drawVeteranJorah(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  isSpeaking: boolean
): void {
  // 1. Heavy Measured Warrior Breathing & Speech Bob
  const talkBob = isSpeaking ? Math.sin(now * 0.02) * 2.2 : 0;
  const breathe = Math.sin(now * 0.0028 + x) * 1.5;
  const cy = y + breathe + talkBob;

  // 2. Idle Sword Rest & Stance Adjustment (6.5-second cycle)
  // 0s - 3.2s: Broad disciplined combat stance
  // 3.2s - 6.5s: Gauntleted hand rests on broadsword pommel, shoulder rolls
  const stanceCycleMs = 6500;
  const cycleTime = (now + x * 200) % stanceCycleMs;
  const isPommelRest = !isSpeaking && cycleTime >= 3000 && cycleTime <= 6200;

  // 3. Natural Blinking
  const isBlinking = ((now + x * 150) % 4600) < 140;

  // 4. Combat Cape Breeze Flutter
  const capeWave = Math.sin(now * 0.005 + x) * 2;

  // --- Shadow ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Speech Aura Ring ---
  if (isSpeaking) {
    const auraPulse = Math.sin(now * 0.012) * 2.5;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 16 + auraPulse, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- Tattered Charcoal-Red Combat Cape draped behind ---
  ctx.fillStyle = '#262626'; // Charcoal cape back
  ctx.fillRect(x - 10, cy - 6, 20, 17);
  ctx.fillStyle = '#7F1D1D'; // Faded blood-red inner lining
  ctx.fillRect(x - 9, cy - 5, 18, 15);
  // Tattered frayed bottom edge flapping
  ctx.fillStyle = '#18181B';
  ctx.fillRect(x - 10 + capeWave, cy + 9, 6, 4);
  ctx.fillRect(x - 2, cy + 10, 5, 4);
  ctx.fillRect(x + 4 - capeWave, cy + 9, 6, 4);

  // --- Heavy Steel Broadsword Sheathed Across Back ---
  // Blade scabbard
  ctx.fillStyle = '#29180C'; // Scabbard leather
  ctx.fillRect(x + 6, cy - 14, 4, 22);
  ctx.fillStyle = '#94A3B8'; // Steel scabbard tip & throat
  ctx.fillRect(x + 6, cy + 7, 4, 2);
  ctx.fillRect(x + 6, cy - 15, 4, 2);
  // Crossguard & Pommel
  ctx.fillStyle = '#D97706'; // Bronze crossguard
  ctx.fillRect(x + 3, cy - 16, 10, 2);
  ctx.fillStyle = '#451A03'; // Wrapped hilt
  ctx.fillRect(x + 7, cy - 21, 2, 5);
  ctx.fillStyle = '#F59E0B'; // Pommel gold ring
  ctx.fillRect(x + 6.5, cy - 23, 3, 2);
  ctx.fillStyle = '#EF4444'; // Red soul gem on pommel
  ctx.fillRect(x + 7.5, cy - 22.5, 1, 1);

  // --- Reinforced Greaves & Sabatons (Legs & Feet) ---
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(x - 7, cy + 9, 5, 5);
  ctx.fillRect(x + 2, cy + 9, 5, 5);
  ctx.fillStyle = '#475569'; // Steel knee cops & toe caps
  ctx.fillRect(x - 7, cy + 7, 5, 3);
  ctx.fillRect(x + 2, cy + 7, 5, 3);
  ctx.fillRect(x - 8, cy + 12, 6, 2);
  ctx.fillRect(x + 2, cy + 12, 6, 2);

  // --- Riveted Steel Brigandine & Crossed Leather Straps ---
  ctx.fillStyle = '#1F2937'; // Heavy dark leather base
  ctx.fillRect(x - 8, cy - 7, 16, 15);
  ctx.fillStyle = '#374151'; // Reinforced body
  ctx.fillRect(x - 7, cy - 6, 14, 13);

  // Steel plate rivets
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(x - 5, cy - 5, 2, 2);
  ctx.fillRect(x + 3, cy - 5, 2, 2);
  ctx.fillRect(x - 5, cy, 2, 2);
  ctx.fillRect(x + 3, cy, 2, 2);

  // Cross-chest scabbard strap with bronze wolf buckle
  ctx.fillStyle = '#451A03';
  ctx.fillRect(x - 7, cy - 6, 3, 3);
  ctx.fillRect(x - 4, cy - 3, 3, 3);
  ctx.fillRect(x - 1, cy, 3, 3);
  ctx.fillRect(x + 2, cy + 3, 3, 3);
  ctx.fillStyle = '#D97706'; // Bronze wolf badge
  ctx.fillRect(x - 2, cy - 2, 4, 4);
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(x - 1, cy - 1, 2, 2);

  // --- Notched Weathered Steel Pauldron on Right Shoulder ---
  ctx.fillStyle = '#334155';
  ctx.fillRect(x + 7, cy - 9, 6, 7);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(x + 8, cy - 8, 4, 5);
  // Steel highlight
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(x + 8, cy - 8, 4, 1);
  // Battle notch cut into pauldron
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(x + 10, cy - 6, 2, 2);

  // Left leather pauldron with fur trim
  ctx.fillStyle = '#78350F';
  ctx.fillRect(x - 12, cy - 8, 5, 6);
  ctx.fillStyle = '#E2E8F0'; // White/gray wolf pelt trim
  ctx.fillRect(x - 13, cy - 9, 7, 2);

  // --- Arm & Hand Stance (Rest on Sword vs Guard vs Speaking) ---
  if (isPommelRest) {
    // Right gauntleted hand resting firmly atop sword pommel
    ctx.fillStyle = '#475569';
    ctx.fillRect(x + 5, cy - 24, 5, 4); // Gauntlet over pommel
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(x + 6, cy - 24, 3, 2);

    // Left hand resting on belt
    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 9, cy + 1, 4, 4);
  } else if (isSpeaking) {
    // Commanding warrior instruction gestures
    const armGest = Math.sin(now * 0.02) * 3;
    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 11, cy - 2 + armGest, 4, 4);
    ctx.fillRect(x + 8, cy - 2 - armGest, 4, 4);
  } else {
    // Solid combat stance with hands at hips
    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 10, cy + 2, 4, 4);
    ctx.fillRect(x + 7, cy + 2, 4, 4);
  }

  // --- Grizzled Veteran Head, Face, Beard & Battle Scar ---
  const headY = cy - 19;

  // Weathered face
  ctx.fillStyle = '#E5B887'; // Weathered skin
  ctx.fillRect(x - 5, headY, 10, 10);

  // Grizzled Graying Dark Hair
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 6, headY - 3, 12, 4); // Top hair
  ctx.fillRect(x - 6, headY, 3, 6); // Left hair side
  ctx.fillRect(x + 4, headY, 3, 6); // Right hair side
  // Silver hair streaks
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(x - 5, headY - 2, 3, 2);
  ctx.fillRect(x + 3, headY - 2, 2, 2);

  // Prominent Jagged Red Battle Scar across Left Cheek & Brow
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(x - 3, headY + 1, 1.5, 2);
  ctx.fillRect(x - 4, headY + 3, 1.5, 3);
  ctx.fillRect(x - 3, headY + 6, 1.5, 2);

  // Steely Blue Eyes & Blinking
  ctx.fillStyle = '#0F172A';
  if (isBlinking) {
    ctx.fillRect(x - 3, headY + 3, 3, 1);
    ctx.fillRect(x + 1, headY + 3, 3, 1);
  } else {
    ctx.fillRect(x - 3, headY + 2.5, 2.5, 2.5);
    ctx.fillRect(x + 1, headY + 2.5, 2.5, 2.5);
    // Steel-blue iris
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(x - 2.5, headY + 3, 1.5, 1.5);
    ctx.fillRect(x + 1.5, headY + 3, 1.5, 1.5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 2, headY + 2.5, 1, 1);
    ctx.fillRect(x + 2, headY + 2.5, 1, 1);
  }

  // Heavy Grizzled Beard & Mustache
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 5, headY + 6, 10, 4); // Mustache
  ctx.fillRect(x - 4, headY + 9, 8, 4); // Full beard
  ctx.fillRect(x - 3, headY + 12, 6, 2); // Beard tip
  // Silver beard strands
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(x - 3, headY + 9, 2, 3);
  ctx.fillRect(x + 2, headY + 9, 2, 3);
  ctx.fillRect(x - 1, headY + 11, 2, 2);

  // Animated Speaking Mouth
  if (isSpeaking) {
    const mouthOpen = Math.sin(now * 0.035) > 0;
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - 2, headY + 8, 4, mouthOpen ? 2.5 : 1);
  }
}

/**
 * Fallback Generic NPC Renderer with distinct pixel-art details, breathing, and blinking.
 */
export function drawGenericNpc(
  ctx: CanvasRenderingContext2D,
  npc: NpcState,
  x: number,
  y: number,
  now: number,
  isSpeaking: boolean
): void {
  const talkBob = isSpeaking ? Math.sin(now * 0.02) * 2.2 : 0;
  const breathe = Math.sin(now * 0.0035 + x) * 1.5;
  const cy = y + breathe + talkBob;
  const isBlinking = ((now + x * 150) % 4000) < 140;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Torso
  ctx.fillStyle = '#374151';
  ctx.fillRect(x - 7, cy - 7, 14, 14);
  ctx.fillStyle = '#4B5563';
  ctx.fillRect(x - 6, cy - 6, 12, 12);

  // Head
  ctx.fillStyle = '#FCD34D';
  ctx.fillRect(x - 5, cy - 17, 10, 10);
  ctx.fillStyle = '#1F2937';
  ctx.fillRect(x - 6, cy - 19, 12, 4);

  // Eyes
  ctx.fillStyle = '#111827';
  if (isBlinking) {
    ctx.fillRect(x - 3, cy - 14, 2, 1);
    ctx.fillRect(x + 1, cy - 14, 2, 1);
  } else {
    ctx.fillRect(x - 3, cy - 14.5, 2, 2);
    ctx.fillRect(x + 1, cy - 14.5, 2, 2);
  }

  if (isSpeaking) {
    const mouthOpen = Math.sin(now * 0.035) > 0;
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - 2, cy - 11, 4, mouthOpen ? 2 : 1);
  }
}

/**
 * Aleph — The Soul-Shifter. A sophisticated man in a dramatic, high-detail hooded cloak.
 * Merges mysterious occult silhouette with high-detail character features.
 */
export function drawMysteriousAleph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  isSpeaking: boolean
): void {
  // 1. Idle Anatomy: Breathing & Stance
  const talkBob = isSpeaking ? Math.sin(now * 0.02) * 2.2 : 0;
  const breathe = Math.sin(now * 0.003 + x) * 1.7;
  const cy = y + breathe + talkBob;

  // 2. Idle Routine (9-second cycle)
  const idleCycleMs = 9000;
  const cycleTime = (now + x * 300) % idleCycleMs;
  const isAdjusting = !isSpeaking && cycleTime >= 4000 && cycleTime <= 7500;
  
  // 3. Natural Blinking & Heterochromia Eyes
  const isBlinking = ((now + x * 200) % 4500) < 140;
  const cloakSway = Math.sin(now * 0.004) * 3;

  // --- Shadow (Deep & Weighted) ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- 1. Large Hooded Void Cloak (Back Layer) ---
  ctx.fillStyle = '#111827'; // Dark charcoal back
  ctx.beginPath();
  ctx.moveTo(x - 15 + cloakSway * 0.5, cy - 12);
  ctx.lineTo(x + 15 - cloakSway * 0.5, cy - 12);
  ctx.lineTo(x + 18 - cloakSway, cy + 12);
  ctx.lineTo(x - 18 + cloakSway, cy + 12);
  ctx.fill();

  // --- 2. Inner Attire: Midnight Vest & Purple Cravat ---
  // These peek through the open front of the cloak
  ctx.fillStyle = '#1E1B4B'; // Midnight vest
  ctx.fillRect(x - 6, cy - 8, 12, 12);
  ctx.fillStyle = '#4C1D95'; // Purple silk cravat
  ctx.fillRect(x - 2, cy - 7, 4, 6);
  ctx.fillStyle = '#7C3AED';
  ctx.fillRect(x - 1, cy - 6, 2, 4);

  // --- 3. Outer Cloak Panels (Deep Indigo) ---
  ctx.fillStyle = '#1E1B4B'; // Main indigo cloak
  // Left Panel
  ctx.beginPath();
  ctx.moveTo(x - 10, cy - 12);
  ctx.lineTo(x - 4, cy - 12);
  ctx.lineTo(x - 5, cy + 12);
  ctx.lineTo(x - 16 + cloakSway, cy + 12);
  ctx.closePath();
  ctx.fill();
  // Right Panel
  ctx.beginPath();
  ctx.moveTo(x + 10, cy - 12);
  ctx.lineTo(x + 4, cy - 12);
  ctx.lineTo(x + 5, cy + 12);
  ctx.lineTo(x + 16 - cloakSway, cy + 12);
  ctx.closePath();
  ctx.fill();

  // Cloak Highlights & Fold Shading
  ctx.fillStyle = '#312E81';
  ctx.fillRect(x - 10, cy - 10, 2, 20);
  ctx.fillRect(x + 8, cy - 10, 2, 20);

  // --- 4. Golden Runic Embroidery on Cloak Hem ---
  ctx.fillStyle = '#D97706';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x - 14 + cloakSway + i * 3, cy + 9, 1.5, 1.5);
    ctx.fillRect(x + 10 - cloakSway + i * 3, cy + 9, 1.5, 1.5);
  }

  // --- 5. Head & Deep Hood ---
  const headY = cy - 22;
  
  // Hood Silhouette
  ctx.fillStyle = '#1E1B4B';
  ctx.beginPath();
  ctx.arc(x, headY + 4, 13, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 13, headY + 4, 26, 8);

  // Golden Runic Trim on Hood Edge
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, headY + 4, 13.5, Math.PI + 0.2, -0.2);
  ctx.stroke();

  // Deep Shadow inside Hood (The Void Face)
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.arc(x, headY + 4, 9, 0, Math.PI * 2);
  ctx.fill();

  // Visible Pale Face peeking through shadow
  ctx.fillStyle = '#FDE68A'; 
  ctx.fillRect(x - 4, headY + 2, 9, 9);
  // Chin shading
  ctx.fillStyle = '#E5E7EB';
  ctx.fillRect(x - 4, headY + 9, 9, 2);

  // Heterochromia Piercing Eyes (Glow effect)
  if (isBlinking) {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x - 3, headY + 6, 2, 1);
    ctx.fillRect(x + 1, headY + 6, 2, 1);
  } else {
    // Left eye: Soul-Cyan Flare
    ctx.fillStyle = '#22D3EE';
    ctx.fillRect(x - 3, headY + 5.5, 2.5, 2.5);
    // Right eye: Star-Gold Flare
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(x + 1, headY + 5.5, 2.5, 2.5);
    // Specular shine
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 2.5, headY + 5.5, 1, 1);
    ctx.fillRect(x + 1.5, headY + 5.5, 1, 1);
  }

  // Dark hair bangs visible under hood
  ctx.fillStyle = '#171717';
  ctx.fillRect(x - 5, headY + 1, 11, 2);
  ctx.fillStyle = '#E2E8F0'; // Silver streak
  ctx.fillRect(x - 4, headY + 1, 3, 1);

  // --- 6. Hands & Celestial Staff ---
  const staffX = x + 19;
  const staffY = cy + Math.sin(now * 0.004) * 2;
  
  if (isSpeaking) {
    const handG = Math.sin(now * 0.015) * 3;
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 12, cy - 2 + handG, 4, 4); // Left hand gesticulating
  } else if (isAdjusting) {
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 9, cy - 14, 4, 4); // Adjusting hood edge
  } else {
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(x - 11, cy + 2, 3, 3); // Hand at rest
  }

  // Right gauntleted hand holding staff
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(x + 10, cy - 2, 4, 6);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(x + 10, cy - 1, 1, 4);

  // Staff Handle
  ctx.fillStyle = '#29180C';
  ctx.fillRect(staffX - 1.5, staffY - 26, 3, 42);
  // Pulsating Purple Soul-Shard
  const shardPulse = 0.8 + Math.sin(now * 0.007) * 0.2;
  ctx.fillStyle = '#A855F7';
  ctx.beginPath();
  ctx.moveTo(staffX, staffY - 34);
  ctx.lineTo(staffX + 5, staffY - 29);
  ctx.lineTo(staffX, staffY - 24);
  ctx.lineTo(staffX - 5, staffY - 29);
  ctx.closePath();
  ctx.fill();
  
  // Ambient staff glow
  const shardGlow = ctx.createRadialGradient(staffX, staffY - 29, 1, staffX, staffY - 29, 12);
  shardGlow.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
  shardGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shardGlow;
  ctx.beginPath();
  ctx.arc(staffX, staffY - 29, 12 * shardPulse, 0, Math.PI * 2);
  ctx.fill();

  // --- 7. Orbiting Soul-Motes ---
  [0, 1, 2].forEach(i => {
    const moteAng = now * 0.0018 + (i * Math.PI * 2) / 3;
    const mx = x + Math.cos(moteAng) * 22;
    const my = cy - 8 + Math.sin(moteAng * 1.1) * 14;
    ctx.fillStyle = i === 0 ? '#22D3EE' : i === 1 ? '#C084FC' : '#FACC15';
    ctx.beginPath();
    ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Speaking Mouth
  if (isSpeaking) {
    const mouthOpen = Math.sin(now * 0.035) > 0;
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - 1.5, headY + 8.5, 3.5, mouthOpen ? 2 : 1);
  }
}

/**
 * Main drawNpc dispatcher function
 */
export function drawNpc(
  ctx: CanvasRenderingContext2D,
  npc: NpcState,
  now: number
): void {
  const x = Math.round(npc.x);
  const y = Math.round(npc.y);
  const isSpeaking = (npc.speakingMs ?? 0) > 0;

  // Route to handcrafted individual NPC sprites
  if (npc.id === 'npc_bram' || npc.spriteKind === 'innkeeper') {
    drawInnkeeperBram(ctx, x, y, now, isSpeaking);
  } else if (npc.id === 'npc_lena' || npc.spriteKind === 'barkeep') {
    drawBarkeeperLena(ctx, x, y, now, isSpeaking);
  } else if (npc.id === 'npc_jorah' || npc.spriteKind === 'veteran') {
    drawVeteranJorah(ctx, x, y, now, isSpeaking);
  } else if (npc.id === 'npc_aleph' || npc.spriteKind === 'mysterious_cloak') {
    drawMysteriousAleph(ctx, x, y, now, isSpeaking);
  } else {
    drawGenericNpc(ctx, npc, x, y, now, isSpeaking);
  }

  // Distinctive Name Badge & Interaction Prompt
  const bob = Math.sin(now * 0.0035 + x) * 1.5;
  ctx.font = '700 10.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = isSpeaking ? '#FCD34D' : '#FDE68A';
  ctx.textAlign = 'center';
  ctx.fillText(npc.name, x, y - 24 + bob);

  ctx.fillStyle = isSpeaking ? '#38BDF8' : '#94A3B8';
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.fillText(isSpeaking ? '• Speaking •' : '[E] Talk', x, y - 34 + bob);
}

/**
 * Floor 6: Elyndor, Keeper of the Last Hymn
 * Aesthetic: Sacred, radiant holy choir angel / ancient sanctuary precentor.
 * Visuals: Consecrated ivory & radiant gold choir vestments with embroidered sun-crosses,
 * flowing celestial platinum-gold hair, glowing amber-gold eyes, radiant solar-choral halo,
 * magnificent seraphic ivory wings with gold quills, and an ornate holy celestial golden harp
 * with glowing vibrating strings, strumming hands, and floating holy musical notes.
 */
export function drawElyndorBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState
): void {
  const breathe = Math.sin(now * 0.0035 + x) * 1.5;
  const cy = y - 4 + breathe;
  const hemSway = Math.sin(now * 0.005) * 2.2;
  const hairSway = Math.sin(now * 0.004) * 2.5;
  const isWindup = (en?.windupMs ?? 0) > 0;
  const isEnraged = en?.enraged ?? false;

  // 1. Consecrated Holy Golden Choral Ground Sanctuary Ring
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 18, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const ringPulse = Math.sin(now * 0.005) * 3;
  ctx.strokeStyle = isEnraged ? 'rgba(239, 68, 68, 0.65)' : 'rgba(245, 158, 11, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 28 + ringPulse, 9 + ringPulse * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Sacred inner gold prayer glyph circle
  ctx.strokeStyle = isEnraged ? 'rgba(251, 146, 60, 0.45)' : 'rgba(254, 240, 138, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 19, 6, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Radiant Solar-Choral Aureole / Sunburst Halo (Behind Head)
  const haloY = cy - 26;
  // Inner glowing holy halo disc
  ctx.fillStyle = isEnraged ? 'rgba(239, 68, 68, 0.25)' : 'rgba(254, 240, 138, 0.28)';
  ctx.beginPath();
  ctx.arc(x, haloY, 14, 0, Math.PI * 2);
  ctx.fill();

  // Radiant Solar Crown Rays (7 divine rays)
  for (let r = 0; r < 7; r++) {
    const rayAng = -Math.PI / 2 + (r - 3) * 0.32;
    const rx1 = x + Math.cos(rayAng) * 11;
    const ry1 = haloY + Math.sin(rayAng) * 9;
    const rx2 = x + Math.cos(rayAng) * 22;
    const ry2 = haloY + Math.sin(rayAng) * 18;
    ctx.strokeStyle = r % 2 === 0 ? '#FEF08A' : '#F59E0B';
    ctx.lineWidth = r === 3 ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(rx1, ry1);
    ctx.lineTo(rx2, ry2);
    ctx.stroke();
  }

  // 3. Seraphic Holy Angel Wings (Pure Ivory & Golden Quills)
  const wingFlap = Math.sin(now * 0.004) * 3.2;
  // Left Angel Wing
  ctx.fillStyle = 'rgba(255, 253, 245, 0.96)'; // Consecrated pearl-white ivory
  ctx.beginPath();
  ctx.moveTo(x - 6, cy - 12);
  ctx.lineTo(x - 36, cy - 28 + wingFlap);
  ctx.lineTo(x - 30, cy - 6 + wingFlap * 0.5);
  ctx.lineTo(x - 6, cy - 2);
  ctx.closePath();
  ctx.fill();

  // Right Angel Wing
  ctx.beginPath();
  ctx.moveTo(x + 6, cy - 12);
  ctx.lineTo(x + 36, cy - 28 - wingFlap);
  ctx.lineTo(x + 30, cy - 6 - wingFlap * 0.5);
  ctx.lineTo(x + 6, cy - 2);
  ctx.closePath();
  ctx.fill();

  // Golden Quill Wing Inlays
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, cy - 12);
  ctx.lineTo(x - 34, cy - 26 + wingFlap);
  ctx.moveTo(x + 8, cy - 12);
  ctx.lineTo(x + 34, cy - 26 - wingFlap);
  ctx.stroke();

  // Secondary radiant feathers
  ctx.strokeStyle = '#FEF08A';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 12, cy - 8);
  ctx.lineTo(x - 28, cy - 14 + wingFlap * 0.7);
  ctx.moveTo(x + 12, cy - 8);
  ctx.lineTo(x + 28, cy - 14 - wingFlap * 0.7);
  ctx.stroke();

  // 4. Flowing Celestial Platinum-Gold Hair (Behind Head & Shoulders)
  ctx.fillStyle = '#B45309'; // Warm golden shadow
  ctx.fillRect(x - 9 + hairSway * 0.4, cy - 26, 18, 12);
  ctx.fillStyle = '#F59E0B'; // Golden amber midtone
  ctx.fillRect(x - 8 + hairSway * 0.7, cy - 24, 16, 18);
  ctx.fillStyle = '#FEF08A'; // Luminous celestial blonde
  ctx.fillRect(x - 7 + hairSway, cy - 20, 14, 18);
  ctx.fillStyle = '#FFFBEB'; // Pure light catchlight
  ctx.fillRect(x - 6 + hairSway * 1.2, cy - 12, 12, 12);

  // 5. Consecrated Sacred Ivory & Gold Liturgical Vestments
  // Under-robe in warm aged alabaster
  ctx.fillStyle = '#D97706'; // Gold embroidered hem underlay
  ctx.fillRect(x - 10, cy - 14, 20, 26);
  // Main Ivory Choir Robe Body
  ctx.fillStyle = '#FAF8F5'; // Pristine sacred white
  ctx.fillRect(x - 9, cy - 12, 18, 25);
  // Robe Shading & Folds
  ctx.fillStyle = '#E5DDD0'; // Soft ivory shadow
  ctx.fillRect(x - 9, cy - 2, 4, 15);
  ctx.fillRect(x + 5, cy - 2, 4, 15);

  // Robe Hem Folds
  ctx.fillStyle = '#F3EFE6';
  ctx.fillRect(x - 10 + hemSway, cy + 11, 20, 4);

  // Sacred Sun-Cross Stole (Draped down center)
  ctx.fillStyle = '#F59E0B'; // Gold stole
  ctx.fillRect(x - 2.5, cy - 12, 5, 25);
  ctx.fillStyle = '#FEF08A'; // Center bright gold
  ctx.fillRect(x - 1.5, cy - 10, 3, 23);
  // Embroidered Golden Sun Crosses on stole
  ctx.fillStyle = '#D97706';
  ctx.fillRect(x - 2, cy - 6, 4, 1.5);
  ctx.fillRect(x - 2, cy + 2, 4, 1.5);
  ctx.fillRect(x - 2, cy + 8, 4, 1.5);

  // Gilded Hem Fringe
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 8 + hemSway, cy + 13, 16, 2);

  // Priest Cuffs (Sacred Ivory with Gold Bands)
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(x - 12, cy - 8, 3, 12);
  ctx.fillRect(x + 9, cy - 8, 3, 12);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 12, cy + 1, 3, 2);
  ctx.fillRect(x + 9, cy + 1, 3, 2);

  // 6. Head, Solemn Visage & Noble Features
  const headY = cy - 27;
  // Porcelain skin
  ctx.fillStyle = '#FFFBEB';
  ctx.fillRect(x - 5, headY, 10, 10);
  ctx.fillStyle = '#FDE68A'; // Jaw shadow
  ctx.fillRect(x - 4, headY + 7, 8, 3);

  // Celestial Platinum-Gold Bangs
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 6, headY - 2, 12, 4);
  ctx.fillRect(x - 6, headY, 3, 6);
  ctx.fillRect(x + 3, headY, 3, 6);
  ctx.fillStyle = '#FFFBEB';
  ctx.fillRect(x - 4, headY - 1, 8, 2);

  // Golden Diadem Circlet
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 6, headY - 1, 12, 2);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 1, headY - 3, 2, 3); // Center sacred crest

  // Serene Amber-Gold Sacred Eyes
  ctx.fillStyle = isEnraged ? '#EF4444' : '#D97706';
  ctx.fillRect(x - 4, headY + 3, 3, 2);
  ctx.fillRect(x + 1, headY + 3, 3, 2);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 3, headY + 3, 1.5, 1.5);
  ctx.fillRect(x + 2, headY + 3, 1.5, 1.5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 3, headY + 3, 1, 1);
  ctx.fillRect(x + 2, headY + 3, 1, 1);

  // 7. SACRED CELESTIAL GOLDEN HARP (Held & Strummed by Elyndor)
  const harpX = x + 4;
  const harpY = cy - 14;
  const strumAnim = Math.sin(now * 0.02) * 1.2;

  ctx.save();
  ctx.translate(harpX, harpY);

  // A. Golden Harmonic Curved Neck (Top Arched Arm with Tuning Pegs)
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.moveTo(2, -8);
  ctx.quadraticCurveTo(12, -14, 22, -6);
  ctx.lineTo(21, -3);
  ctx.quadraticCurveTo(12, -10, 3, -5);
  ctx.closePath();
  ctx.fill();

  // Golden Tuning Pegs (5 tuning pins on top curve)
  ctx.fillStyle = '#FEF08A';
  for (let p = 0; p < 5; p++) {
    const px = 5 + p * 3.6;
    const py = -8 - Math.sin((p / 4) * Math.PI) * 4;
    ctx.fillRect(px, py - 2, 1.5, 2);
  }

  // B. Forepillar: Sculpted Angelic Wing Curve Pillar (Right Side)
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.moveTo(22, -6);
  ctx.quadraticCurveTo(25, 4, 20, 18);
  ctx.lineTo(17, 18);
  ctx.quadraticCurveTo(22, 4, 19, -4);
  ctx.closePath();
  ctx.fill();

  // Golden Wing Sculpting Highlight on Pillar
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(20, -1, 2, 7);
  ctx.fillRect(19, 7, 2, 6);

  // Angel Wing Crest on Top of Pillar
  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.moveTo(22, -6);
  ctx.lineTo(26, -11);
  ctx.lineTo(23, -4);
  ctx.closePath();
  ctx.fill();

  // C. Soundboard (Body along Left/Back)
  ctx.fillStyle = '#78350F'; // Dark walnut soundbox edge
  ctx.fillRect(1, -6, 3, 25);
  ctx.fillStyle = '#FEF3C7'; // Consecrated alabaster soundboard face
  ctx.fillRect(2, -5, 2.5, 23);
  // Gold Rosette Soundhole
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(2.5, 5, 2, 3);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(3, 6, 1, 1);

  // D. Base Pedestal of Harp
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 18, 22, 3);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(2, 19, 18, 1);

  // E. Luminous Glowing Holy Harp Strings (5 vibrating golden strings)
  for (let s = 0; s < 5; s++) {
    const topX = 5 + s * 3.4;
    const topY = -7 - Math.sin((s / 4) * Math.PI) * 2;
    const botX = 3 + s * 3.2;
    const botY = 18;

    // String vibration physics when strummed
    const vib = Math.sin(now * 0.025 + s * 1.3) * (isWindup ? 1.4 : 0.6);

    ctx.strokeStyle = isWindup
      ? '#FFFFFF'
      : s % 2 === 0
        ? '#FEF08A'
        : '#FDE047';
    ctx.lineWidth = isWindup ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo((topX + botX) / 2 + vib, (topY + botY) / 2, botX, botY);
    ctx.stroke();
  }

  // F. Elyndor's Hands Gracefully Strumming the Strings
  // Left Hand holding the pillar
  ctx.fillStyle = '#FFFBEB'; // Skin
  ctx.fillRect(16, 4, 3, 3);
  ctx.fillStyle = '#F59E0B'; // Gold bracelet
  ctx.fillRect(15, 3, 2, 2);

  // Right Hand plucking strings near the center
  const pluckY = 4 + strumAnim;
  ctx.fillStyle = '#FFFBEB';
  ctx.fillRect(8, pluckY, 4, 3);
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(9, pluckY + 1, 1.5, 2); // Finger tips
  ctx.fillStyle = '#F59E0B'; // Gold cuff
  ctx.fillRect(6, pluckY - 1, 2, 4);

  // G. Floating Holy Musical Notes & Sacred Light Motes
  for (let m = 0; m < 4; m++) {
    const mPhase = (now * 0.0018 + m * 0.25) % 1;
    const noteX = 10 + Math.sin(now * 0.005 + m * 1.5) * 8 + (m - 1.5) * 4;
    const noteY = -10 - mPhase * 28;
    const noteAlpha = Math.sin(mPhase * Math.PI);

    ctx.save();
    ctx.globalAlpha = noteAlpha;
    ctx.fillStyle = m % 2 === 0 ? '#FEF08A' : '#FBBF24';
    ctx.font = '700 8px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m === 0 ? '♪' : m === 1 ? '♫' : m === 2 ? '♩' : '♪', noteX, noteY);

    // Sacred holy golden light spark
    ctx.fillStyle = '#FFFBEB';
    ctx.fillRect(noteX + 3, noteY - 2, 1.5, 1.5);
    ctx.restore();
  }

  // H. Windup Intense Sacred Choral Harmonic Resonance Wave
  if (isWindup) {
    const waveR = 10 + ((now * 0.035) % 18);
    const waveAlpha = Math.max(0, 1 - waveR / 28);
    ctx.strokeStyle = `rgba(254, 240, 138, ${waveAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(10, 6, waveR, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary golden chord ring
    ctx.strokeStyle = `rgba(245, 158, 11, ${waveAlpha * 0.7})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(10, 6, waveR * 0.65, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Floor 7: Zadkiel, Keeper of the Ashen Reliquary
 * Aesthetic: Ancient, reverent, solemn armored knight.
 * Visuals: Tarnished silver-steel plate with gold filigree, ashen battle tabard with golden Reliquary Crest,
 * lion/skull pauldrons, open visored bascinet showing resolute eyes, massive Ashen Reliquary Tower Shield
 * with the Eye of Remembrance, runic broadsword, swinging waist censer with incense smoke.
 */
export function drawZadkielBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState
): void {
  const breathe = Math.sin(now * 0.003 + x) * 1.2;
  const cy = y - 4 + breathe;
  const tabardSway = Math.sin(now * 0.004) * 1.5;
  const isWindup = (en?.windupMs ?? 0) > 0;
  const isShielding = (en?.shieldWallMs ?? 0) > 0;
  const isEnraged = en?.enraged ?? false;

  // 1. Heavy Battle Shadow & Ashen Ember Dust
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y + 15, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Floating Ashen Relic Embers
  for (let e = 0; e < 3; e++) {
    const ePhase = (now * 0.0015 + e * 0.33) % 1;
    const ex1 = x - 12 + ((e * 17) % 24) + Math.sin(now * 0.005 + e) * 4;
    const ey1 = y + 12 - ePhase * 28;
    ctx.fillStyle = e % 2 === 0 ? '#F59E0B' : '#94A3B8';
    ctx.fillRect(Math.round(ex1), Math.round(ey1), 1.5, 1.5);
  }

  // 2. Ashen Reliquary Angel Wings
  const wingFlap = Math.sin(now * 0.0035) * 2.8;
  ctx.fillStyle = 'rgba(203, 213, 225, 0.95)'; // Silver-steel feathers
  // Left Wing
  ctx.beginPath();
  ctx.moveTo(x - 8, cy - 10);
  ctx.lineTo(x - 36, cy - 22 + wingFlap);
  ctx.lineTo(x - 28, cy + 2 + wingFlap * 0.4);
  ctx.lineTo(x - 8, cy);
  ctx.closePath();
  ctx.fill();
  // Right Wing
  ctx.beginPath();
  ctx.moveTo(x + 8, cy - 10);
  ctx.lineTo(x + 36, cy - 22 - wingFlap);
  ctx.lineTo(x + 28, cy + 2 - wingFlap * 0.4);
  ctx.lineTo(x + 8, cy);
  ctx.closePath();
  ctx.fill();

  // Antique Gold Relic Quill Accents
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 10, cy - 10);
  ctx.lineTo(x - 34, cy - 20 + wingFlap);
  ctx.moveTo(x + 10, cy - 10);
  ctx.lineTo(x + 34, cy - 20 - wingFlap);
  ctx.stroke();

  // 3. Heavy Armored Greaves & Sabatons
  ctx.fillStyle = '#1E293B'; // Dark boots base
  ctx.fillRect(x - 8, cy + 9, 6, 6);
  ctx.fillRect(x + 2, cy + 9, 6, 6);
  ctx.fillStyle = '#475569'; // Silver steel plate
  ctx.fillRect(x - 7, cy + 10, 5, 4);
  ctx.fillRect(x + 3, cy + 10, 5, 4);

  // 3. Tarnished Silver-Steel Plate Cuirass & Tabard
  ctx.fillStyle = '#334155'; // Dark steel base
  ctx.fillRect(x - 11, cy - 12, 22, 22);
  ctx.fillStyle = '#64748B'; // Silver breastplate
  ctx.fillRect(x - 9, cy - 10, 18, 18);
  // Gold filigree edge
  ctx.fillStyle = '#D97706';
  ctx.fillRect(x - 10, cy - 11, 20, 2);
  ctx.fillRect(x - 10, cy + 7, 20, 2);

  // Ashen-Gray Split Battle Tabard
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(x - 5 + tabardSway, cy - 8, 10, 22);
  // Golden Reliquary Crest
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 3 + tabardSway, cy - 4, 6, 8);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 1 + tabardSway, cy - 2, 2, 4);

  // Sculpted Lion Pauldrons
  ctx.fillStyle = '#475569';
  ctx.fillRect(x - 15, cy - 13, 6, 9);
  ctx.fillRect(x + 9, cy - 13, 6, 9);
  ctx.fillStyle = '#F59E0B'; // Gold trim
  ctx.fillRect(x - 15, cy - 14, 6, 2);
  ctx.fillRect(x + 9, cy - 14, 6, 2);

  // 4. Open-Visor Bascinet Helm & Noble Knight Visage
  const headY = cy - 26;
  // Helm dome
  ctx.fillStyle = '#475569';
  ctx.fillRect(x - 6, headY - 2, 12, 5);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(x - 5, headY - 1, 10, 4);
  // Gold Helm Crown Crest
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 2, headY - 4, 4, 3);
  ctx.fillRect(x - 4, headY - 3, 8, 1.5);

  // Resolute Face inside Visor
  ctx.fillStyle = '#FCD34D'; // Skin
  ctx.fillRect(x - 5, headY + 3, 10, 7);
  // Cropped Silver Hair at temples
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(x - 5, headY + 2, 2, 4);
  ctx.fillRect(x + 3, headY + 2, 2, 4);

  // Resolute Gray Eyes
  ctx.fillStyle = isEnraged ? '#EF4444' : '#0284C7';
  ctx.fillRect(x - 4, headY + 5, 3, 2);
  ctx.fillRect(x + 1, headY + 5, 3, 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 3, headY + 5, 1, 1);
  ctx.fillRect(x + 2, headY + 5, 1, 1);

  // 5. Left Hand: Ashen Reliquary Tower Shield
  const shieldX = x - 26;
  const shieldY = cy - 14;
  // Shield base
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(shieldX, shieldY, 15, 28);
  ctx.fillStyle = '#475569';
  ctx.fillRect(shieldX + 1, shieldY + 1, 13, 26);
  // Gold Filigree Border
  ctx.fillStyle = '#D97706';
  ctx.strokeRect(shieldX + 1, shieldY + 1, 13, 26);

  // Glowing Eye of Remembrance Centerpiece
  const eyeGlow = isShielding || isWindup;
  ctx.fillStyle = eyeGlow ? '#FEF08A' : '#F59E0B';
  ctx.fillRect(shieldX + 4, shieldY + 8, 7, 7);
  ctx.fillStyle = eyeGlow ? '#FFFFFF' : '#B45309';
  ctx.fillRect(shieldX + 6, shieldY + 10, 3, 3);

  // Shield Wall Barrier FX
  if (isShielding) {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(shieldX - 4, shieldY - 4, 23, 36);
  }

  // 6. Right Hand: Runic Relic Broadsword
  const swordX = x + 18;
  // Steel Blade
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(swordX, cy - 24, 4, 34);
  ctx.fillStyle = '#E2E8F0'; // Fuller highlight
  ctx.fillRect(swordX + 1, cy - 22, 2, 30);
  // Runic script along fuller
  ctx.fillStyle = isEnraged ? '#F59E0B' : '#38BDF8';
  ctx.fillRect(swordX + 1, cy - 16, 2, 3);
  ctx.fillRect(swordX + 1, cy - 8, 2, 3);
  // Gold Crossguard & Pommel
  ctx.fillStyle = '#D97706';
  ctx.fillRect(swordX - 4, cy + 8, 12, 3);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(swordX + 1, cy + 13, 2, 3);

  // 7. Swinging Waist Censer (Incense Wisps)
  const censerSwing = Math.sin(now * 0.005) * 3;
  const censerX = x + 7 + censerSwing;
  const censerY = cy + 6;
  ctx.fillStyle = '#D97706';
  ctx.fillRect(censerX, censerY, 3, 4);
  // White incense smoke particle
  const smokePhase = (now * 0.003) % 1;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.6)';
  ctx.fillRect(censerX + Math.sin(now * 0.006) * 4, censerY - 4 - smokePhase * 10, 2, 2);
}

/**
 * Floor 8: Sariel, Warden of the Veiled Scripture
 * Aesthetic: Mysterious, celestial scholar-priestess, corrupted sacred lore.
 * Visuals: Levitation above floor, midnight-indigo and astral violet vestments with diamond stars,
 * veiled celestial cowl with crescent brooch, dual eyes (radiant gold / void magenta),
 * 4 illuminated scripture pages orbiting in 3D perspective, armillary celestial crozier.
 */
export function drawSarielBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState
): void {
  const floatY = Math.sin(now * 0.004) * 3.5;
  const cy = y - 6 + floatY;
  const veilSway = Math.sin(now * 0.005) * 3;
  const isWindup = (en?.windupMs ?? 0) > 0;
  const isEnraged = en?.enraged ?? false;

  // 1. Soft Cosmic Void-Starlight Ground Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Faint Twinkling Star Dust below
  for (let s = 0; s < 3; s++) {
    const sAng = now * 0.002 + s * 2.1;
    const sx = x + Math.cos(sAng) * 20;
    const sy = y + 14 + Math.sin(sAng) * 5;
    ctx.fillStyle = s % 2 === 0 ? '#FEF08A' : '#C084FC';
    ctx.fillRect(Math.round(sx), Math.round(sy), 1.5, 1.5);
  }

  // 2. Four Celestial-Void Angel Wings
  const wingFlap = Math.sin(now * 0.004) * 3.5;
  // Upper Major Wings (Midnight-violet feathers dusted with star-points)
  ctx.fillStyle = 'rgba(147, 51, 234, 0.9)'; // Astral violet
  // Left Wing
  ctx.beginPath();
  ctx.moveTo(x - 8, cy - 12);
  ctx.lineTo(x - 36, cy - 26 + wingFlap);
  ctx.lineTo(x - 30, cy - 4 + wingFlap * 0.5);
  ctx.lineTo(x - 8, cy - 2);
  ctx.closePath();
  ctx.fill();
  // Right Wing
  ctx.beginPath();
  ctx.moveTo(x + 8, cy - 12);
  ctx.lineTo(x + 36, cy - 26 - wingFlap);
  ctx.lineTo(x + 30, cy - 4 - wingFlap * 0.5);
  ctx.lineTo(x + 8, cy - 2);
  ctx.closePath();
  ctx.fill();

  // Celestial Star Quill Edges
  ctx.strokeStyle = '#E0F2FE';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 10, cy - 12);
  ctx.lineTo(x - 34, cy - 24 + wingFlap);
  ctx.moveTo(x + 10, cy - 12);
  ctx.lineTo(x + 34, cy - 24 - wingFlap);
  ctx.stroke();

  // Lower Minor Wings
  ctx.fillStyle = 'rgba(88, 28, 135, 0.82)';
  ctx.beginPath();
  ctx.moveTo(x - 6, cy + 2);
  ctx.lineTo(x - 24, cy + 14 + wingFlap * 0.4);
  ctx.lineTo(x - 6, cy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 6, cy + 2);
  ctx.lineTo(x + 24, cy + 14 - wingFlap * 0.4);
  ctx.lineTo(x + 6, cy + 10);
  ctx.closePath();
  ctx.fill();

  // 3. Billowing Celestial Outer Veil (Behind Head & Body)
  ctx.fillStyle = '#311042'; // Dark shadow
  ctx.fillRect(x - 11 + veilSway * 0.6, cy - 20, 22, 34);
  ctx.fillStyle = '#581C87'; // Astral violet
  ctx.fillRect(x - 10 + veilSway * 0.8, cy - 16, 20, 32);

  // 4. Midnight-Indigo Vestments with Diamond Stars
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(x - 8, cy - 12, 16, 26);
  ctx.fillStyle = '#312E81';
  ctx.fillRect(x - 7, cy - 10, 14, 23);

  // Diamond Starlight Points on Robe
  ctx.fillStyle = '#E0F2FE';
  ctx.fillRect(x - 4, cy - 4, 1.5, 1.5);
  ctx.fillRect(x + 3, cy + 2, 1.5, 1.5);
  ctx.fillRect(x - 2, cy + 7, 1.5, 1.5);
  ctx.fillRect(x + 2, cy - 8, 1.5, 1.5);

  // Gold Astronomical Zodiac Sash
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 7, cy + 2, 14, 2);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 1, cy + 1, 2, 4);

  // 4. Veiled Celestial Cowl & Visage
  const headY = cy - 26;
  // Cowl
  ctx.fillStyle = '#4C1D95';
  ctx.fillRect(x - 6, headY - 2, 12, 12);
  ctx.fillStyle = '#6B21A8';
  ctx.fillRect(x - 5, headY - 1, 10, 10);
  // Gold Crescent Brooch on Cowl
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 4, headY - 1, 3, 2);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 3, headY, 1.5, 1.5);

  // Face
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(x - 4, headY + 3, 8, 7);
  // Silver Hair Locks spilling from cowl
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(x - 5, headY + 4, 2, 5);
  ctx.fillRect(x + 3, headY + 4, 2, 5);

  // Striking Dual Eyes: Radiant Gold (Sacred) vs Void Magenta (Corrupted)
  ctx.fillStyle = isEnraged ? '#EF4444' : '#FEF08A'; // Left: Sacred Gold
  ctx.fillRect(x - 3, headY + 5, 2, 2);
  ctx.fillStyle = '#F43F5E'; // Right: Corrupted Void Magenta
  ctx.fillRect(x + 1, headY + 5, 2, 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 2, headY + 5, 1, 1);
  ctx.fillRect(x + 2, headY + 5, 1, 1);

  // 5. 4 Orbiting Illuminated Scripture Tablets (3D Orbit)
  const tabletOrbitSpeed = isWindup ? 0.005 : 0.0022;
  for (let i = 0; i < 4; i++) {
    const tAng = now * tabletOrbitSpeed + (i * Math.PI) / 2;
    const tx = x + Math.cos(tAng) * 26;
    const ty = cy - 2 + Math.sin(tAng) * 11;

    // Scripture Parchment Tablet
    ctx.fillStyle = '#FEF9C3';
    ctx.fillRect(Math.round(tx - 3), Math.round(ty - 4), 6, 8);
    // Void Scripture Inscription
    ctx.fillStyle = i % 2 === 0 ? '#9333EA' : '#0284C7';
    ctx.fillRect(Math.round(tx - 2), Math.round(ty - 2), 4, 1);
    ctx.fillRect(Math.round(tx - 2), Math.round(ty), 4, 1);

    // Glowing Script Glow Aura
    ctx.strokeStyle = isEnraged ? 'rgba(244, 63, 94, 0.7)' : 'rgba(192, 132, 252, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(tx - 4), Math.round(ty - 5), 8, 10);
  }

  // 6. Right Hand: Veiled Celestial Crozier
  const crozierX = x + 16;
  ctx.fillStyle = '#4B5563'; // Dark metal staff
  ctx.fillRect(crozierX, cy - 20, 2, 30);
  // Armillary Sphere & Void Core
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(crozierX + 1, cy - 22, 6, 0, Math.PI * 2);
  ctx.stroke();
  // Pulsing Void-Star Core
  ctx.fillStyle = isWindup ? '#F43F5E' : '#C084FC';
  ctx.fillRect(crozierX - 1, cy - 24, 4, 4);
}

/**
 * Floor 9: Seraphel, Sentinel of the Final Seal
 * Aesthetic: Imposing, radiant, divine celestial champion.
 * Visuals: 4 magnificent feathered starlight wings with gentle flap physics,
 * gleaming polished ivory & solar-gold plate armor, sculpted winged pauldrons,
 * noble paladin face with sweeping golden hair, winged solar crown diadem,
 * two-handed Starlight Spear of Judgement, Final Seal sunburst shield.
 */
export function drawSeraphelBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState
): void {
  const breathe = Math.sin(now * 0.0035) * 1.5;
  const cy = y - 4 + breathe;
  const wingFlap = Math.sin(now * 0.0045) * 3.5;
  const isWindup = (en?.windupMs ?? 0) > 0;
  const isEnraged = en?.enraged ?? false;

  // 1. Radiant Solar Ground Glow & Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y + 15, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const auraR = 30 + Math.sin(now * 0.006) * 4;
  const solarGrad = ctx.createRadialGradient(x, y + 15, 4, x, y + 15, auraR);
  solarGrad.addColorStop(0, isEnraged ? 'rgba(239, 68, 68, 0.35)' : 'rgba(254, 240, 138, 0.35)');
  solarGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = solarGrad;
  ctx.beginPath();
  ctx.ellipse(x, y + 15, auraR, auraR * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Four Celestial Starlight Wings
  // Upper Major Wings
  ctx.fillStyle = 'rgba(248, 250, 252, 0.95)'; // Pure ivory white
  // Left Wing
  ctx.beginPath();
  ctx.moveTo(x - 8, cy - 14);
  ctx.lineTo(x - 36, cy - 28 + wingFlap);
  ctx.lineTo(x - 30, cy - 6 + wingFlap * 0.5);
  ctx.lineTo(x - 8, cy - 4);
  ctx.closePath();
  ctx.fill();
  // Right Wing
  ctx.beginPath();
  ctx.moveTo(x + 8, cy - 14);
  ctx.lineTo(x + 36, cy - 28 - wingFlap);
  ctx.lineTo(x + 30, cy - 6 - wingFlap * 0.5);
  ctx.lineTo(x + 8, cy - 4);
  ctx.closePath();
  ctx.fill();

  // Golden Wing Quill Accents
  ctx.strokeStyle = '#FDE047';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 12, cy - 14);
  ctx.lineTo(x - 34, cy - 26 + wingFlap);
  ctx.moveTo(x + 12, cy - 14);
  ctx.lineTo(x + 34, cy - 26 - wingFlap);
  ctx.stroke();

  // Lower Minor Wings
  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  ctx.beginPath();
  ctx.moveTo(x - 6, cy);
  ctx.lineTo(x - 26, cy + 12 + wingFlap * 0.4);
  ctx.lineTo(x - 6, cy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 6, cy);
  ctx.lineTo(x + 26, cy + 12 - wingFlap * 0.4);
  ctx.lineTo(x + 6, cy + 8);
  ctx.closePath();
  ctx.fill();

  // 3. Rotating Solar Geometric Halo (Behind Head)
  const haloRot = now * 0.0018;
  ctx.save();
  ctx.translate(x, cy - 26);
  ctx.rotate(haloRot);
  ctx.strokeStyle = isEnraged ? 'rgba(239, 68, 68, 0.8)' : 'rgba(251, 191, 36, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.stroke();
  for (let h = 0; h < 4; h++) {
    const hAng = (h * Math.PI) / 2;
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(Math.cos(hAng) * 15 - 1.5, Math.sin(hAng) * 15 - 1.5, 3, 3);
  }
  ctx.restore();

  // 4. Polished Ivory & Gold Cuirass
  ctx.fillStyle = '#F8FAFC'; // Ivory cuirass
  ctx.fillRect(x - 9, cy - 12, 18, 22);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(x - 8, cy - 10, 16, 20);

  // Solar-Gold Final Seal Emblem on Breastplate
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(x - 4, cy - 8, 8, 8);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 2, cy - 6, 4, 4);

  // Winged Solar Pauldrons
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(x - 14, cy - 14, 6, 10);
  ctx.fillRect(x + 8, cy - 14, 6, 10);
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(x - 15, cy - 15, 7, 2);
  ctx.fillRect(x + 8, cy - 15, 7, 2);

  // Ivory Greaves & Sabatons
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(x - 7, cy + 10, 5, 6);
  ctx.fillRect(x + 2, cy + 10, 5, 6);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 7, cy + 14, 5, 2);
  ctx.fillRect(x + 2, cy + 14, 5, 2);

  // 5. Head, Winged Diadem & Paladin Countenance
  const headY = cy - 27;
  // Face
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(x - 5, headY, 10, 9);
  // Swept Radiant Golden Hair
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 6, headY - 3, 12, 4);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 6, headY - 1, 3, 7);
  ctx.fillRect(x + 3, headY - 1, 3, 7);

  // Winged Solar Diadem Crown
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(x - 6, headY - 2, 12, 2);
  ctx.fillRect(x - 8, headY - 5, 3, 4); // Left wing diadem
  ctx.fillRect(x + 5, headY - 5, 3, 4); // Right wing diadem

  // Radiant Golden Eyes of Conviction
  ctx.fillStyle = isEnraged ? '#EF4444' : '#EAB308';
  ctx.fillRect(x - 4, headY + 3, 3, 2);
  ctx.fillRect(x + 1, headY + 3, 3, 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 3, headY + 3, 1, 1);
  ctx.fillRect(x + 2, headY + 3, 1, 1);

  // 6. Right Hand: Starlight Spear of Judgement
  const spearX = x + 18;
  // Ivory Shaft
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(spearX, cy - 30, 2, 44);
  // Golden Winged Crossguard
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(spearX - 4, cy - 24, 10, 3);
  // Razor Crystalline Spearhead
  ctx.fillStyle = isWindup ? '#FEF08A' : '#38BDF8';
  ctx.fillRect(spearX - 1, cy - 36, 4, 8);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(spearX, cy - 38, 2, 4);

  // 7. Left Hand: Final Seal Sunburst Shield
  const shieldX = x - 22;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(shieldX, cy - 8, 10, 18);
  ctx.fillStyle = '#EAB308';
  ctx.strokeRect(shieldX, cy - 8, 10, 18);
  ctx.fillRect(shieldX + 3, cy - 2, 4, 6);
}

/**
 * Floor 10: Oriphiel, The Last Warden
 * Aesthetic: Sacred Divine Solar Archangel / Supreme Warden of Light & Absolute Protection.
 * Visuals: Towering titan archangel frame (1.25x scale), consecrated alabaster & solar-gold plate armor,
 * royal white & gold sanctuary aegis cape, open solar-crown helm with 9 radiant crown rays,
 * serene amber-gold eyes of divine judgment, 4 monumental archangel wings of pure ivory light & gold quills,
 * Colossal Greatblade of Consecrated Aegis, and a sacred solar-shielding aegis barrier.
 */
export function drawOriphielBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState
): void {
  const breathe = Math.sin(now * 0.003) * 1.2;
  const cy = y - 6 + breathe;
  const cloakBillow = Math.sin(now * 0.004) * 3;
  const isWindup = (en?.windupMs ?? 0) > 0;
  const isEnraged = en?.enraged ?? false;

  // 1. Consecrated Holy Golden Sanctuary Ground Protection Compass & Titan Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(x, y + 17, 26, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warden's Solar Sanctuary Protection Compass Ring on Floor
  const wardR = 36 + Math.sin(now * 0.004) * 3;
  ctx.strokeStyle = isEnraged ? 'rgba(239, 68, 68, 0.7)' : 'rgba(245, 158, 11, 0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 17, wardR, wardR * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner Gold Protection Ring
  ctx.strokeStyle = isEnraged ? 'rgba(251, 146, 60, 0.5)' : 'rgba(254, 240, 138, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y + 17, wardR * 0.75, wardR * 0.26, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 4 Cardinal Solar Glyphs on Compass Ward Ring
  for (let c = 0; c < 4; c++) {
    const cAng = (c * Math.PI) / 2 + now * 0.001;
    const cx1 = x + Math.cos(cAng) * wardR;
    const cy1 = y + 17 + Math.sin(cAng) * (wardR * 0.35);
    ctx.fillStyle = isEnraged ? '#EF4444' : '#FEF08A';
    ctx.fillRect(Math.round(cx1 - 2), Math.round(cy1 - 2), 4, 4);
  }

  // 2. Four Monumental Archangel Warden Wings of Pure Light
  const wingFlap = Math.sin(now * 0.0035) * 3.8;
  // Upper Grand Archangel Wings (Consecrated Ivory & Solar Gold)
  ctx.fillStyle = 'rgba(255, 253, 245, 0.96)'; // Pure alabaster-ivory plumage
  // Left Upper Wing
  ctx.beginPath();
  ctx.moveTo(x - 10, cy - 16);
  ctx.lineTo(x - 48, cy - 34 + wingFlap);
  ctx.lineTo(x - 36, cy - 4 + wingFlap * 0.5);
  ctx.lineTo(x - 10, cy - 4);
  ctx.closePath();
  ctx.fill();
  // Right Upper Wing
  ctx.beginPath();
  ctx.moveTo(x + 10, cy - 16);
  ctx.lineTo(x + 48, cy - 34 - wingFlap);
  ctx.lineTo(x + 36, cy - 4 - wingFlap * 0.5);
  ctx.lineTo(x + 10, cy - 4);
  ctx.closePath();
  ctx.fill();

  // Luminous Solar-Gold Quill Edges
  ctx.strokeStyle = isEnraged ? '#EF4444' : '#F59E0B';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x - 12, cy - 16);
  ctx.lineTo(x - 46, cy - 32 + wingFlap);
  ctx.moveTo(x + 12, cy - 16);
  ctx.lineTo(x + 46, cy - 32 - wingFlap);
  ctx.stroke();

  // Lower Minor Archangel Wings
  ctx.fillStyle = 'rgba(254, 243, 199, 0.92)';
  ctx.beginPath();
  ctx.moveTo(x - 8, cy - 2);
  ctx.lineTo(x - 34, cy + 14 + wingFlap * 0.4);
  ctx.lineTo(x - 8, cy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 8, cy - 2);
  ctx.lineTo(x + 34, cy + 14 - wingFlap * 0.4);
  ctx.lineTo(x + 8, cy + 8);
  ctx.closePath();
  ctx.fill();

  // 3. Billowing Pure White & Gold Sanctuary Aegis Cape
  ctx.fillStyle = '#D97706'; // Gold shadow underlay
  ctx.fillRect(x - 17 + cloakBillow * 0.6, cy - 18, 34, 40);
  ctx.fillStyle = '#FAF8F5'; // Pristine white sanctuary cape
  ctx.fillRect(x - 15 + cloakBillow * 0.8, cy - 14, 30, 36);
  // Gold embroidered sun-cross on cape hem
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 3 + cloakBillow * 0.8, cy + 10, 6, 10);
  ctx.fillRect(x - 6 + cloakBillow * 0.8, cy + 13, 12, 4);

  // 4. Towering Consecrated White Alabaster & Solar-Gold Plate Armor
  ctx.fillStyle = '#E5DDD0'; // White armor shadow
  ctx.fillRect(x - 13, cy - 14, 26, 26);
  ctx.fillStyle = '#FAF8F5'; // Pure white alabaster plate
  ctx.fillRect(x - 11, cy - 12, 22, 22);

  // Glowing Solar Protection Cross Carved in Breastplate
  ctx.fillStyle = isEnraged ? '#EF4444' : '#F59E0B';
  ctx.fillRect(x - 4, cy - 10, 8, 2.5);
  ctx.fillRect(x - 1.5, cy - 8, 3, 14);
  ctx.fillRect(x - 6, cy - 2, 12, 2.5);
  ctx.fillRect(x - 8, cy + 4, 16, 2);

  // Gilded Pauldrons of Protection
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 20, cy - 16, 8, 12);
  ctx.fillRect(x + 12, cy - 16, 8, 12);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 21, cy - 18, 9, 3);
  ctx.fillRect(x + 12, cy - 18, 9, 3);

  // Armored Greaves & Sabatons (Ivory & Gold)
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(x - 9, cy + 12, 7, 8);
  ctx.fillRect(x + 2, cy + 12, 7, 8);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 8, cy + 13, 5, 6);
  ctx.fillRect(x + 3, cy + 13, 5, 6);

  // 5. Head, Grand Solar Sunburst Crown-Helm & Resolute Visage
  const headY = cy - 32;

  // Solar Aureole / Crown Rays behind Helm (9 radiant rays)
  for (let r = 0; r < 9; r++) {
    const rayAng = -Math.PI / 2 + (r - 4) * 0.28;
    const rx1 = x + Math.cos(rayAng) * 12;
    const ry1 = headY + Math.sin(rayAng) * 10;
    const rx2 = x + Math.cos(rayAng) * 24;
    const ry2 = headY + Math.sin(rayAng) * 20;
    ctx.strokeStyle = r % 2 === 0 ? '#FEF08A' : '#F59E0B';
    ctx.lineWidth = r === 4 ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(rx1, ry1);
    ctx.lineTo(rx2, ry2);
    ctx.stroke();
  }

  // White Alabaster Helm Dome
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(x - 7, headY - 2, 14, 6);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - 6, headY - 1, 12, 2);

  // Flowing Platinum-Gold Hair
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 9, headY - 6, 4, 12);
  ctx.fillRect(x + 5, headY - 6, 4, 12);

  // Face inside Helm Visor
  ctx.fillStyle = '#FFFBEB'; // Porcelain skin
  ctx.fillRect(x - 6, headY + 4, 12, 8);
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(x - 4, headY + 8, 8, 3);

  // Serene Amber-Gold Eyes of Divine Judgment
  ctx.fillStyle = isEnraged ? '#EF4444' : '#D97706';
  ctx.fillRect(x - 5, headY + 6, 4, 2);
  ctx.fillRect(x + 1, headY + 6, 4, 2);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - 4, headY + 6, 1.5, 1.5);
  ctx.fillRect(x + 2, headY + 6, 1.5, 1.5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 4, headY + 6, 1, 1);
  ctx.fillRect(x + 2, headY + 6, 1, 1);

  // 6. Colossal Greatblade of Consecrated Aegis
  const swordX = x + 16;
  // Broad Consecrated White-Steel Blade
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(swordX, cy - 40, 8, 56);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(swordX + 2, cy - 38, 4, 52);

  // Glowing Solar Protection Fuller & Inlaid Runes
  ctx.fillStyle = isEnraged ? '#EF4444' : '#F59E0B';
  ctx.fillRect(swordX + 2.5, cy - 30, 3, 7);
  ctx.fillRect(swordX + 2.5, cy - 18, 3, 9);
  ctx.fillRect(swordX + 2.5, cy - 4, 3, 7);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(swordX + 3.5, cy - 28, 1, 5);
  ctx.fillRect(swordX + 3.5, cy - 16, 1, 7);

  // Ornate Gold Crossguard & Sunburst Pommel
  ctx.fillStyle = '#D97706';
  ctx.fillRect(swordX - 7, cy + 12, 22, 5);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(swordX - 5, cy + 13, 18, 3);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(swordX + 2, cy + 18, 4, 5); // Pommel

  // 7. SACRED SOLAR AEGIS SHIELD OF DIVINE PROTECTION
  if (isWindup || en?.charging) {
    ctx.save();
    const shieldX = x - 12;
    const shieldY = cy;

    // Glowing Radiant Golden Aegis Barrier Shield
    ctx.strokeStyle = isEnraged ? 'rgba(239, 68, 68, 0.95)' : 'rgba(254, 240, 138, 0.95)';
    ctx.fillStyle = isEnraged ? 'rgba(239, 68, 68, 0.22)' : 'rgba(245, 158, 11, 0.25)';
    ctx.lineWidth = 2.5;

    // Towering Sacred Kite Shield of Light
    ctx.beginPath();
    ctx.moveTo(shieldX - 22, shieldY - 26);
    ctx.lineTo(shieldX + 22, shieldY - 26);
    ctx.lineTo(shieldX + 18, shieldY + 14);
    ctx.lineTo(shieldX, shieldY + 30);
    ctx.lineTo(shieldX - 18, shieldY + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inlaid Solar Cross Emblem on Barrier
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shieldX, shieldY - 20);
    ctx.lineTo(shieldX, shieldY + 20);
    ctx.moveTo(shieldX - 14, shieldY - 6);
    ctx.lineTo(shieldX + 14, shieldY - 6);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Humanoid boss sprite dispatcher for Floors 6-10
 */
export function drawHumanoidBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bossName: string,
  now: number,
  en?: EnemyState
): void {
  if (bossName.includes('Elyndor')) {
    drawElyndorBoss(ctx, x, y, now, en);
  } else if (bossName.includes('Zadkiel')) {
    drawZadkielBoss(ctx, x, y, now, en);
  } else if (bossName.includes('Sariel')) {
    drawSarielBoss(ctx, x, y, now, en);
  } else if (bossName.includes('Seraphel')) {
    drawSeraphelBoss(ctx, x, y, now, en);
  } else if (bossName.includes('Oriphiel')) {
    drawOriphielBoss(ctx, x, y, now, en);
  } else {
    // Elegant fallback humanoid guardian
    drawOriphielBoss(ctx, x, y, now, en);
  }
}
