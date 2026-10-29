import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
} from './model-config.crypto.js';

const key = deriveKey('a'.repeat(32));

describe('model API key encryption', () => {
  it('round-trips a key and produces a versioned payload', () => {
    const cipher = encryptSecret('sk-test-value', key);
    expect(cipher.split(':').length).toBe(4);
    expect(cipher.startsWith('v1:')).toBe(true);
    expect(cipher).not.toContain('sk-test-value');
    expect(decryptSecret(cipher, key)).toBe('sk-test-value');
  });

  it('uses a fresh IV so equal keys do not produce equal ciphertext', () => {
    expect(encryptSecret('same-key', key)).not.toBe(
      encryptSecret('same-key', key),
    );
  });

  it('rejects a payload encrypted with another secret', () => {
    const cipher = encryptSecret('sk-test-value', key);
    expect(() => decryptSecret(cipher, deriveKey('b'.repeat(32)))).toThrow();
  });

  it('rejects tampered and malformed payloads', () => {
    const cipher = encryptSecret('sk-test-value', key);
    const [version, iv, tag, data] = cipher.split(':');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 0xff;
    expect(() =>
      decryptSecret(
        [version, iv, tag, flipped.toString('base64url')].join(':'),
        key,
      ),
    ).toThrow();
    expect(() => decryptSecret('plain-text', key)).toThrow();
  });
});
