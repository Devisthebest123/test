/**
 * Whisper wire protocol, version 1 (wire id "pigeon/v1", kept from the project's first name).
 *
 * A drop is one Memo-program instruction whose text is the base64 of:
 *
 *   magic "PGN1"      4 bytes
 *   ephemeral x25519  32 bytes   fresh per drop; never reused
 *   tag               8 bytes    HKDF(shared)[32..40] lets the recipient
 *                                skip AEAD on drops that are not theirs
 *   nonce             24 bytes   XChaCha20-Poly1305
 *   ciphertext        n+16 bytes
 *
 * Plaintext before encryption is padded to a fixed bucket so the chain only
 * learns which of three sizes a drop was, never its true length:
 *
 *   flags             1 byte     bit0: sender identity present
 *                                bit1: a payment rides with this drop
 *   sender            32 bytes   sender's Ed25519 identity key, zero when anonymous
 *   signature         64 bytes   Ed25519 by the sender over this drop, zero when anonymous
 *   lamports          8 bytes    big-endian, zero when no payment
 *   length            2 bytes    big-endian body length
 *   body              utf-8
 *   padding           zeros to the bucket boundary
 *
 * Identities are Ed25519 keypairs. The Whisper ID is the Ed25519 public key.
 * Key agreement uses the birationally equivalent X25519 keys (RFC 7748 §4.1,
 * the same map Signal and libsodium use), so one key both signs and agrees.
 *
 * A sender who includes their identity signs
 *   "pigeon/v1/sender" ‖ ephemeral ‖ recipient ‖ lamports ‖ length ‖ body
 * which binds the claim to this exact drop. A recipient only reports a
 * sender when that signature verifies; otherwise the drop is anonymous.
 *
 * Payments: the same shared secret that encrypts the note also yields a
 * 32-byte stealth seed. The sender turns it into a one-time Solana keypair
 * and funds that address in the same transaction. The recipient derives the
 * identical seed from their own secret and the ephemeral key, so they alone
 * can spend from it. The chain sees a never-before-seen wallet get paid.
 *
 * Everything here is pure: no Solana, no DOM. It runs in Node for tests.
 */

import {xchacha20poly1305} from '@noble/ciphers/chacha';
import {equalBytes} from '@noble/ciphers/utils';
import {ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub, x25519} from '@noble/curves/ed25519';
import {hkdf} from '@noble/hashes/hkdf';
import {sha256} from '@noble/hashes/sha2';
import {concatBytes, randomBytes, utf8ToBytes} from '@noble/hashes/utils';
import bs58 from 'bs58';
import {bech32mDecode, bech32mEncode} from './bech32.ts';

export const PROTOCOL = 'pigeon/v1';
export const MAGIC = utf8ToBytes('PGN1');
export const KEY_LEN = 32;
export const SIG_LEN = 64;
export const TAG_LEN = 8;
export const NONCE_LEN = 24;
export const SEED_LEN = 32;
export const AEAD_OVERHEAD = 16;
export const HEADER_LEN = MAGIC.length + KEY_LEN + TAG_LEN + NONCE_LEN; // 68
export const PLAIN_HEADER_LEN = 1 + KEY_LEN + SIG_LEN + 8 + 2; // 107

/**
 * Padded plaintext sizes. The largest still fits one Solana transaction
 * together with a board reference and a stealth transfer.
 */
export const BUCKETS = [160, 320, 576] as const;
export const MAX_BODY = BUCKETS[BUCKETS.length - 1] - PLAIN_HEADER_LEN; // 469

/** Base64 length of the biggest possible drop; useful for size displays. */
export const MAX_MEMO_CHARS = Math.ceil((HEADER_LEN + BUCKETS[2] + AEAD_OVERHEAD) / 3) * 4; // 880

const FLAG_SENDER = 1;
const FLAG_PAYMENT = 2;
const SENDER_DOMAIN = utf8ToBytes('pigeon/v1/sender');

/**
 * An identity: Ed25519 seed and public key (the Whisper ID), plus the
 * X25519 pair derived from them for key agreement.
 */
export type Identity = {
  secret: Uint8Array;
  public: Uint8Array;
  xSecret: Uint8Array;
  xPublic: Uint8Array;
};

export type Envelope = {
  ephemeral: Uint8Array;
  tag: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

export type Sealed = {
  envelope: Envelope;
  /** Seed of the one-time wallet this drop pays into. Only meaningful when lamports > 0. */
  stealthSeed: Uint8Array;
};

export type Note = {
  body: string;
  /** Sender's identity key, present only when their signature over this drop verified. */
  sender: Uint8Array | null;
  /** True when a sender claim was present but its signature failed; the drop is treated as anonymous. */
  senderForged: boolean;
  /** Lamports the sender said they put in the stealth wallet; 0 for a plain note. */
  lamports: bigint;
  /** Seed of the stealth wallet for this drop. Spendable by the recipient. */
  stealthSeed: Uint8Array;
  bucket: number;
};

// ---------------------------------------------------------------- identities

export function identityFromSecret(secret: Uint8Array): Identity {
  if (secret.length !== KEY_LEN) throw new Error('secret must be 32 bytes');
  const pub = ed25519.getPublicKey(secret);
  return {secret, public: pub, xSecret: edwardsToMontgomeryPriv(secret), xPublic: edwardsToMontgomeryPub(pub)};
}

export function randomIdentity(): Identity {
  return identityFromSecret(randomBytes(KEY_LEN));
}

/** Derive a stable identity from a 64-byte wallet signature over IDENTITY_MESSAGE. */
export function identityFromSignature(signature: Uint8Array): Identity {
  return identityFromSecret(hkdf(sha256, signature, utf8ToBytes(PROTOCOL), utf8ToBytes('identity'), KEY_LEN));
}

export const IDENTITY_MESSAGE =
  'Whisper identity (v1)\n\n' +
  'Signing this message derives your drop address from your wallet.\n' +
  'It costs nothing and moves no funds. Sign it only on Whisper pages you trust.';

// ------------------------------------------------------------------ Whisper IDs

/**
 * A Whisper ID is bech32m with the prefix "wsp", so it reads `wsp1…` and can
 * never be mistaken for a wallet address. The older base58 form (version
 * byte, key, 4-byte checksum) is still accepted on input.
 */
export const ID_HRP = 'wsp';
const ADDR_VERSION = 0x01;

export function encodeAddress(pub: Uint8Array): string {
  return bech32mEncode(ID_HRP, pub);
}

export function decodeAddress(text: string): Uint8Array {
  const t = text.trim().replace(/^whisper:/i, '');
  const b = bech32mDecode(ID_HRP, t);
  if (b) {
    if (b.length !== KEY_LEN) throw new Error('not a Whisper ID');
    return b;
  }
  // legacy base58
  let raw: Uint8Array;
  try {
    raw = bs58.decode(t);
  } catch {
    throw new Error('not a Whisper ID');
  }
  if (raw.length !== 1 + KEY_LEN + 4 || raw[0] !== ADDR_VERSION) throw new Error('not a Whisper ID');
  const payload = raw.subarray(0, 1 + KEY_LEN);
  if (!equalBytes(checksum(payload), raw.subarray(1 + KEY_LEN))) throw new Error('bad checksum');
  return Uint8Array.from(payload.subarray(1));
}

export function isAddress(text: string): boolean {
  try {
    decodeAddress(text);
    return true;
  } catch {
    return false;
  }
}

function checksum(payload: Uint8Array): Uint8Array {
  return sha256(sha256(payload)).subarray(0, 4);
}

// ---------------------------------------------------------------------- keys

/** key || tag || stealth seed, all from one HKDF over the shared secret. */
function derive(shared: Uint8Array, ephemeral: Uint8Array, recipient: Uint8Array) {
  const okm = hkdf(
    sha256,
    shared,
    concatBytes(ephemeral, recipient),
    utf8ToBytes(PROTOCOL),
    KEY_LEN + TAG_LEN + SEED_LEN,
  );
  return {
    key: okm.subarray(0, KEY_LEN),
    tag: okm.subarray(KEY_LEN, KEY_LEN + TAG_LEN),
    seed: Uint8Array.from(okm.subarray(KEY_LEN + TAG_LEN)),
  };
}

function aad(ephemeral: Uint8Array, tag: Uint8Array) {
  return concatBytes(MAGIC, ephemeral, tag);
}

function senderMessage(ephemeral: Uint8Array, recipient: Uint8Array, lamports: Uint8Array, len: Uint8Array, body: Uint8Array) {
  return concatBytes(SENDER_DOMAIN, ephemeral, recipient, lamports, len, body);
}

// ------------------------------------------------------------------- sealing

export function bucketFor(bodyBytes: number): number {
  const need = PLAIN_HEADER_LEN + bodyBytes;
  const b = BUCKETS.find((n) => n >= need);
  if (b === undefined) throw new Error(`note is ${bodyBytes - MAX_BODY} bytes too long`);
  return b;
}

/**
 * Encrypt a drop to a recipient (an Ed25519 identity key). `sender`, when
 * given, is written into the plaintext together with a signature over this
 * drop so the recipient can both reply and trust the from line. `lamports`
 * > 0 marks a payment; the caller funds the wallet derived from the returned
 * stealth seed.
 */
export function seal(recipient: Uint8Array, body: string, sender: Identity | null, lamports: bigint = 0n): Sealed {
  if (lamports < 0n || lamports > 0xffffffffffffffffn) throw new Error('bad amount');
  const text = utf8ToBytes(body);
  const bucket = bucketFor(text.length);

  const eSecret = randomBytes(KEY_LEN);
  const ephemeral = x25519.getPublicKey(eSecret);

  const lam = new Uint8Array(8);
  writeU64(lam, 0, lamports);
  const len = new Uint8Array([text.length >> 8, text.length & 0xff]);

  const plain = new Uint8Array(bucket);
  plain[0] = (sender ? FLAG_SENDER : 0) | (lamports > 0n ? FLAG_PAYMENT : 0);
  if (sender) {
    plain.set(sender.public, 1);
    plain.set(ed25519.sign(senderMessage(ephemeral, recipient, lam, len, text), sender.secret), 1 + KEY_LEN);
  }
  plain.set(lam, 1 + KEY_LEN + SIG_LEN);
  plain.set(len, 1 + KEY_LEN + SIG_LEN + 8);
  plain.set(text, PLAIN_HEADER_LEN);

  return sealPlaintext(recipient, plain, eSecret, ephemeral);
}

/**
 * Low level: seal an already laid-out plaintext. Exposed for tests that need
 * to construct malformed or forged plaintexts; applications use `seal`.
 */
export function sealPlaintext(
  recipient: Uint8Array,
  plain: Uint8Array,
  eSecret: Uint8Array = randomBytes(KEY_LEN),
  ephemeral: Uint8Array = x25519.getPublicKey(eSecret),
): Sealed {
  const shared = x25519.getSharedSecret(eSecret, edwardsToMontgomeryPub(recipient));
  const {key, tag, seed} = derive(shared, ephemeral, recipient);
  const nonce = randomBytes(NONCE_LEN);
  const ciphertext = xchacha20poly1305(key, nonce, aad(ephemeral, tag)).encrypt(plain);
  return {envelope: {ephemeral, tag, nonce, ciphertext}, stealthSeed: seed};
}

/** Cheap first pass: does this drop's tag match what `me` would derive? */
export function addressedTo(me: Identity, env: Envelope): boolean {
  const shared = x25519.getSharedSecret(me.xSecret, env.ephemeral);
  return equalBytes(derive(shared, env.ephemeral, me.public).tag, env.tag);
}

/** Full decrypt. Returns null if the drop is not for `me` or has been tampered with. */
export function open(me: Identity, env: Envelope): Note | null {
  const shared = x25519.getSharedSecret(me.xSecret, env.ephemeral);
  const {key, tag, seed} = derive(shared, env.ephemeral, me.public);
  if (!equalBytes(tag, env.tag)) return null;
  let plain: Uint8Array;
  try {
    plain = xchacha20poly1305(key, env.nonce, aad(env.ephemeral, tag)).decrypt(env.ciphertext);
  } catch {
    return null;
  }
  if (plain.length < PLAIN_HEADER_LEN) return null;
  const flags = plain[0];
  const lamBytes = plain.subarray(1 + KEY_LEN + SIG_LEN, 1 + KEY_LEN + SIG_LEN + 8);
  const lenBytes = plain.subarray(1 + KEY_LEN + SIG_LEN + 8, PLAIN_HEADER_LEN);
  const lamports = flags & FLAG_PAYMENT ? readU64(lamBytes, 0) : 0n;
  const len = (lenBytes[0] << 8) | lenBytes[1];
  if (PLAIN_HEADER_LEN + len > plain.length) return null;
  const text = plain.subarray(PLAIN_HEADER_LEN, PLAIN_HEADER_LEN + len);
  const body = new TextDecoder().decode(text);

  let sender: Uint8Array | null = null;
  let senderForged = false;
  if (flags & FLAG_SENDER) {
    const claimed = Uint8Array.from(plain.subarray(1, 1 + KEY_LEN));
    const sig = plain.subarray(1 + KEY_LEN, 1 + KEY_LEN + SIG_LEN);
    let ok = false;
    try {
      ok = ed25519.verify(sig, senderMessage(env.ephemeral, me.public, lamBytes, lenBytes, text), claimed);
    } catch {
      ok = false;
    }
    if (ok) sender = claimed;
    else senderForged = true;
  }
  return {body, sender, senderForged, lamports, stealthSeed: seed, bucket: plain.length};
}

// ---------------------------------------------------------------- wire format

export function encodeEnvelope(env: Envelope): Uint8Array {
  return concatBytes(MAGIC, env.ephemeral, env.tag, env.nonce, env.ciphertext);
}

export function decodeEnvelope(bytes: Uint8Array): Envelope | null {
  if (bytes.length < HEADER_LEN + AEAD_OVERHEAD) return null;
  if (!equalBytes(bytes.subarray(0, MAGIC.length), MAGIC)) return null;
  let o = MAGIC.length;
  const take = (n: number) => bytes.subarray(o, (o += n));
  return {
    ephemeral: Uint8Array.from(take(KEY_LEN)),
    tag: Uint8Array.from(take(TAG_LEN)),
    nonce: Uint8Array.from(take(NONCE_LEN)),
    ciphertext: Uint8Array.from(bytes.subarray(o)),
  };
}

export function toMemo(env: Envelope): string {
  return toBase64(encodeEnvelope(env));
}

export function fromMemo(memo: string): Envelope | null {
  if (!memo.startsWith('UEdO')) return null; // base64("PGN"), a fast reject
  try {
    return decodeEnvelope(fromBase64(memo));
  } catch {
    return null;
  }
}

/** A drop addressed to nobody, used as cover traffic. Indistinguishable from a real note. */
export function chaff(): Envelope {
  const sizes = [0, BUCKETS[0], BUCKETS[1]];
  const body = 'x'.repeat(sizes[Math.floor(Math.random() * sizes.length)]);
  return seal(randomIdentity().public, body, null).envelope;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function writeU64(buf: Uint8Array, at: number, v: bigint) {
  for (let i = 7; i >= 0; i--) {
    buf[at + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

function readU64(buf: Uint8Array, at: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(buf[at + i]);
  return v;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
