import type { NpcState } from '../shared/types.ts';

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
  } else {
    drawGenericNpc(ctx, npc, x, y, now, isSpeaking);
  }

  // Floating Speech Indicator Bubble
  if (isSpeaking) {
    const iconBob = Math.sin(now * 0.01) * 2;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💬', x, y - 36 + iconBob);
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
