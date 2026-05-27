import { describe, it, expect, vi } from 'vitest';

// push.ts transitively imports ./supabase; mock it so importing the module
// under test never spins up a real client. The decoder itself touches none
// of it — this just keeps the import graph hermetic.
vi.mock('../src/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
}));

import { urlBase64ToUint8Array } from '../src/lib/push';

describe('urlBase64ToUint8Array', () => {
  it('decodes a padding-free base64 string to the right bytes', () => {
    // "AQAB" is the canonical 65537 exponent encoding → [1, 0, 1].
    expect(Array.from(urlBase64ToUint8Array('AQAB'))).toEqual([1, 0, 1]);
  });

  it('substitutes the url-safe alphabet (- → +, _ → /) before decoding', () => {
    // Bytes [251, 255] encode to "+/8=" in standard base64, i.e. "-_8" in
    // base64url. A decoder that forgot the substitution would throw or yield
    // garbage — this pins the url-safe handling that VAPID keys rely on.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });

  it('restores missing padding for inputs whose length is not a multiple of 4', () => {
    expect(Array.from(urlBase64ToUint8Array('AA'))).toEqual([0]); // pads to "AA=="
    expect(Array.from(urlBase64ToUint8Array('AAA'))).toEqual([0, 0]); // pads to "AAA="
  });

  it('returns an empty Uint8Array for an empty string', () => {
    const out = urlBase64ToUint8Array('');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(0);
  });

  it('round-trips an unpadded, url-safe key of real VAPID shape (65-byte P-256 point)', () => {
    // A VAPID applicationServerKey is the 65-byte uncompressed P-256 point
    // (0x04 prefix + X + Y), delivered as unpadded base64url. Build one whose
    // standard-base64 form contains + and / so the round-trip exercises both
    // the substitution and the padding-restoration paths on realistic input.
    const bytes = new Uint8Array(65);
    bytes[0] = 0x04;
    for (let i = 1; i < 65; i++) bytes[i] = (i * 37) % 256;

    const urlSafe = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const decoded = urlBase64ToUint8Array(urlSafe);
    expect(decoded.length).toBe(65);
    expect(decoded[0]).toBe(0x04);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
