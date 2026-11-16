// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import {
  isUuid,
  isSessionToken,
  safeEqual,
  getBearer,
  signAdminToken,
  verifyAdminToken,
  rateLimited,
} from '../security';
import { generateSessionToken } from '@photovoks/shared-types';
import { SignJWT } from 'jose';

beforeAll(() => {
  process.env.ADMIN_SESSION_SECRET = 'test-secret-that-is-at-least-32-characters-long';
});

describe('validators', () => {
  it('accepts real UUIDs and rejects path tricks', () => {
    expect(isUuid('3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe(true);
    expect(isUuid('../sessions/abc')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });

  it('accepts generated session tokens only', () => {
    expect(isSessionToken(generateSessionToken())).toBe(true);
    expect(isSessionToken('short')).toBe(false);
    expect(isSessionToken('has spaces in it!!')).toBe(false);
  });

  it('safeEqual compares strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('getBearer extracts only valid tokens', () => {
    const t = generateSessionToken();
    expect(getBearer(new Request('http://x', { headers: { authorization: `Bearer ${t}` } }))).toBe(t);
    expect(getBearer(new Request('http://x', { headers: { authorization: 'Basic abc' } }))).toBeNull();
    expect(getBearer(new Request('http://x'))).toBeNull();
  });
});

describe('admin session token', () => {
  it('round-trips a signed token', async () => {
    const token = await signAdminToken('admin-1');
    expect(await verifyAdminToken(token)).toBe(true);
  });

  it('rejects tampered, foreign and missing tokens', async () => {
    const token = await signAdminToken('admin-1');
    expect(await verifyAdminToken(token.slice(0, -2) + 'xx')).toBe(false);
    expect(await verifyAdminToken(undefined)).toBe(false);

    const foreign = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('photovoks/admin')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('some-other-secret-some-other-secret!!'));
    expect(await verifyAdminToken(foreign)).toBe(false);
  });
});

describe('rateLimited', () => {
  it('blocks after max hits in the window', () => {
    const key = `k-${Math.random()}`;
    expect(rateLimited(key, 2, 60_000)).toBe(false);
    expect(rateLimited(key, 2, 60_000)).toBe(false);
    expect(rateLimited(key, 2, 60_000)).toBe(true);
  });
});
