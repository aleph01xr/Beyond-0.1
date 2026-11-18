import crypto from 'node:crypto';
import {
  MAX_ATTRIBUTE,
  MAX_LEVEL,
  type AccountRecord,
  type HeroClassId,
} from '../shared/types.ts';

export const SHARED_IDENTITY_ISSUER = 'beyond-dungeons' as const;
export const SHARED_IDENTITY_AUDIENCE = 'beyond-overworld' as const;
export const DEFAULT_ASSERTION_TTL_SECONDS = 60;
export const MIN_SHARED_IDENTITY_SECRET_LENGTH = 16;

export interface SignedDungeonsAssertionPayload {
  iss: typeof SHARED_IDENTITY_ISSUER;
  aud: typeof SHARED_IDENTITY_AUDIENCE;
  exp: number;
  iat: number;
  jti: string;
  accountId: string;
  username: string;
  isAdmin: boolean;
  preferredClass: HeroClassId;
  lockedClass: HeroClassId;
  level: number;
  xp: number;
  strength: number;
  vitality: number;
  dexterity: number;
  intelligence: number;
  faith: number;
  attributePoints: number;
}

export function hashPassword(pw: string): string {
  const newSalt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, newSalt, 64).toString('hex');
  return `scrypt:${newSalt}:${hash}`;
}

export function verifyPassword(pw: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const derivedBuf = crypto.scryptSync(pw, salt, 64);
      if (expectedBuf.length !== derivedBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, derivedBuf);
    } catch {
      return false;
    }
  }

  // Legacy SHA-256 fallback (compared in constant time)
  try {
    const expectedBuf = Buffer.from(storedHash, 'hex');
    const legacyBuf = crypto
      .createHash('sha256')
      .update(`beyond_salt_${pw}`)
      .digest();
    if (expectedBuf.length !== legacyBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, legacyBuf);
  } catch {
    return false;
  }
}

export function normalizeHeroClass(raw: unknown): HeroClassId {
  if (raw === 'ranger' || raw === 'arcanist' || raw === 'cleric') {
    return raw;
  }
  return 'vanguard';
}

function clampAttr(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(MAX_ATTRIBUTE, Math.floor(num)));
}

export function buildSharedAssertionPayload(
  acc: AccountRecord,
  ttlSeconds = DEFAULT_ASSERTION_TTL_SECONDS,
  nowMs = Date.now()
): SignedDungeonsAssertionPayload {
  const rawLevel = Number(acc.level) || 1;
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(rawLevel)));
  const xp = level >= MAX_LEVEL ? 0 : Math.max(0, Math.floor(Number(acc.xp) || 0));
  const lockedClass = normalizeHeroClass(acc.lockedClass || acc.preferredClass);
  const preferredClass = normalizeHeroClass(acc.preferredClass || lockedClass);
  const iat = Math.floor(nowMs / 1000);
  const safeTtl = Math.max(10, Math.min(300, Math.floor(ttlSeconds)));

  return {
    iss: SHARED_IDENTITY_ISSUER,
    aud: SHARED_IDENTITY_AUDIENCE,
    exp: iat + safeTtl,
    iat,
    jti: crypto.randomBytes(16).toString('hex'),
    accountId: acc.id,
    username: acc.username,
    isAdmin: Boolean(acc.isAdmin),
    preferredClass,
    lockedClass,
    level,
    xp,
    strength: clampAttr(acc.strength),
    vitality: clampAttr(acc.vitality),
    dexterity: clampAttr(acc.dexterity),
    intelligence: clampAttr(acc.intelligence),
    faith: clampAttr(acc.faith),
    attributePoints: Math.max(0, Math.floor(Number(acc.attributePoints) || 0)),
  };
}

export function signDungeonsIdentityAssertion(
  payload: SignedDungeonsAssertionPayload,
  secret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyDungeonsIdentityAssertion(
  assertionToken: string,
  secret: string,
  nowMs = Date.now()
): { ok: true; payload: SignedDungeonsAssertionPayload } | { ok: false; error: string } {
  if (!secret || secret.length < MIN_SHARED_IDENTITY_SECRET_LENGTH) {
    return { ok: false, error: 'Shared identity secret is missing or too short.' };
  }
  const parts = assertionToken.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: 'Malformed identity assertion.' };
  }
  const [encodedPayload, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const providedDigest = crypto.createHash('sha256').update(providedSig, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expectedSig, 'utf8').digest();
  if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedDigest, expectedDigest)) {
    return { ok: false, error: 'Invalid identity assertion signature.' };
  }

  let parsed: SignedDungeonsAssertionPayload;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SignedDungeonsAssertionPayload;
  } catch {
    return { ok: false, error: 'Malformed identity assertion payload.' };
  }

  if (
    !parsed ||
    parsed.iss !== SHARED_IDENTITY_ISSUER ||
    parsed.aud !== SHARED_IDENTITY_AUDIENCE ||
    typeof parsed.accountId !== 'string' ||
    !parsed.accountId ||
    typeof parsed.username !== 'string' ||
    !parsed.username ||
    typeof parsed.exp !== 'number'
  ) {
    return { ok: false, error: 'Invalid identity assertion claims.' };
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (parsed.exp <= nowSec) {
    return { ok: false, error: 'Identity assertion has expired.' };
  }

  return { ok: true, payload: parsed };
}

export function extractSecretFromHeaders(
  authorizationHeader: string | undefined,
  xSecretHeader: string | undefined
): string | null {
  if (typeof authorizationHeader === 'string') {
    const trimmed = authorizationHeader.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) {
      const token = trimmed.slice(7).trim();
      if (token) return token;
    }
  }
  if (typeof xSecretHeader === 'string') {
    const token = xSecretHeader.trim();
    if (token) return token;
  }
  return null;
}

export function verifySharedIdentityRequestSecret(
  authorizationHeader: string | undefined,
  xSecretHeader: string | undefined,
  expectedSecret: string | undefined
): { ok: true } | { ok: false; status: number; error: string } {
  const normalizedExpected = expectedSecret?.trim() || '';
  if (normalizedExpected.length < MIN_SHARED_IDENTITY_SECRET_LENGTH) {
    return {
      ok: false,
      status: 503,
      error: 'Shared identity integration secret is not configured.',
    };
  }

  const provided = extractSecretFromHeaders(authorizationHeader, xSecretHeader);
  if (!provided) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: Missing shared identity secret.',
    };
  }

  const providedDigest = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(normalizedExpected, 'utf8').digest();
  if (
    provided.length !== normalizedExpected.length ||
    !crypto.timingSafeEqual(providedDigest, expectedDigest)
  ) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: Invalid shared identity secret.',
    };
  }

  return { ok: true };
}

export class SlidingWindowRateLimiter {
  private readonly hitsByKey = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  consume(key: string, nowMs = Date.now()): boolean {
    const cutoff = nowMs - this.windowMs;
    const existing = this.hitsByKey.get(key) ?? [];
    const recent = existing.filter((ts) => ts > cutoff);
    if (recent.length >= this.maxRequests) {
      this.hitsByKey.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hitsByKey.set(key, recent);
    if (this.hitsByKey.size > 2000) {
      for (const [k, list] of this.hitsByKey.entries()) {
        const filtered = list.filter((ts) => ts > cutoff);
        if (filtered.length === 0) this.hitsByKey.delete(k);
        else this.hitsByKey.set(k, filtered);
      }
    }
    return true;
  }
}
