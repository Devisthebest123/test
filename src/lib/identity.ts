/**
 * Where drop identities come from.
 *
 *  wallet   sign IDENTITY_MESSAGE once; the signature seeds the x25519 key.
 *           Deterministic, so the same wallet always yields the same address.
 *  burner   a throwaway Solana keypair kept in this browser; its seed also
 *           derives the drop identity, so one secret backs both.
 *  imported a bare 32-byte secret pasted in.
 */

import {Keypair, Transaction} from '@solana/web3.js';
import {hkdf} from '@noble/hashes/hkdf';
import {sha256} from '@noble/hashes/sha2';
import {utf8ToBytes} from '@noble/hashes/utils';
import bs58 from 'bs58';
import type {DropSigner} from './board.ts';
import {KEY_LEN, PROTOCOL, identityFromSecret, type Identity} from './protocol.ts';
import {drop, load, save} from './store.ts';

export type IdentitySource = 'wallet' | 'burner' | 'imported';

export function burnerIdentity(kp: Keypair): Identity {
  const seed = kp.secretKey.subarray(0, 32);
  return identityFromSecret(hkdf(sha256, seed, utf8ToBytes(PROTOCOL), utf8ToBytes('burner-identity'), KEY_LEN));
}

export function burnerSigner(kp: Keypair): DropSigner {
  return {
    publicKey: kp.publicKey,
    async signTransaction(tx: Transaction) {
      tx.partialSign(kp);
      return tx;
    },
  };
}

export function loadBurner(): Keypair | null {
  const raw = load<string | null>('burner', null);
  if (!raw) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    return null;
  }
}

export function saveBurner(kp: Keypair) {
  save('burner', bs58.encode(kp.secretKey));
}

export function clearBurner() {
  drop('burner');
}

export function exportSecret(id: Identity): string {
  return bs58.encode(id.secret);
}

export function importSecret(text: string): Identity {
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(text.trim());
  } catch {
    throw new Error('expected a base58 secret');
  }
  if (bytes.length !== KEY_LEN) throw new Error('secret must decode to 32 bytes');
  return identityFromSecret(bytes);
}

export function shortKey(s: string, head = 4, tail = 4): string {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}
