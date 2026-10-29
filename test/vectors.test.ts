import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, it} from 'node:test';
import {ed25519, edwardsToMontgomeryPub, x25519} from '@noble/curves/ed25519';
import {hkdf} from '@noble/hashes/hkdf';
import {sha256} from '@noble/hashes/sha2';
import {concatBytes, hexToBytes, utf8ToBytes} from '@noble/hashes/utils';
import {Keypair} from '@solana/web3.js';
import {boardAddress} from '../src/lib/board.ts';
import {
  BUCKETS,
  MAX_BODY,
  MAX_MEMO_CHARS,
  PLAIN_HEADER_LEN,
  PROTOCOL,
  bucketFor,
  decodeAddress,
  encodeAddress,
  identityFromSecret,
  identityFromSignature,
} from '../src/lib/protocol.ts';

const v = JSON.parse(readFileSync('docs/test-vectors.json', 'utf8'));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('test vectors', () => {
  it('constants', () => {
    assert.equal(v.protocol, PROTOCOL);
    assert.deepEqual(v.constants.buckets, [...BUCKETS]);
    assert.equal(v.constants.plainHeaderLen, PLAIN_HEADER_LEN);
    assert.equal(v.constants.maxBody, MAX_BODY);
    assert.equal(v.constants.maxMemoChars, MAX_MEMO_CHARS);
  });

  it('identity from seed', () => {
    const id = identityFromSecret(hexToBytes(v.identity.seed));
    assert.equal(hex(id.public), v.identity.public);
    assert.equal(hex(id.xPublic), v.identity.xPublic);
    assert.equal(hex(edwardsToMontgomeryPub(id.public)), v.identity.xPublic);
    assert.equal(encodeAddress(id.public), v.identity.id);
    assert.equal(hex(decodeAddress(v.identity.id)), v.identity.public);
  });

  it('identity from signature', () => {
    const id = identityFromSignature(hexToBytes(v.identityFromSignature.signature));
    assert.equal(hex(id.secret), v.identityFromSignature.seed);
    assert.equal(hex(id.public), v.identityFromSignature.public);
    assert.equal(encodeAddress(id.public), v.identityFromSignature.id);
  });

  it('key schedule and stealth wallet', () => {
    const k = v.keySchedule;
    const esk = hexToBytes(k.ephemeralSecret);
    const rpk = hexToBytes(k.recipientPublic);
    const epk = x25519.getPublicKey(esk);
    assert.equal(hex(epk), k.ephemeralPublic);
    const shared = x25519.getSharedSecret(esk, edwardsToMontgomeryPub(rpk));
    assert.equal(hex(shared), k.shared);
    // and the recipient side agrees
    const me = identityFromSecret(hexToBytes(v.identity.seed));
    assert.equal(hex(x25519.getSharedSecret(me.xSecret, epk)), k.shared);
    const okm = hkdf(sha256, shared, concatBytes(epk, rpk), utf8ToBytes(PROTOCOL), 72);
    assert.equal(hex(okm.subarray(0, 32)), k.key);
    assert.equal(hex(okm.subarray(32, 40)), k.tag);
    assert.equal(hex(okm.subarray(40, 72)), k.stealthSeed);
    assert.equal(Keypair.fromSeed(okm.subarray(40, 72)).publicKey.toBase58(), k.stealthWallet);
  });

  it('sender signature', () => {
    const s = v.senderSignature;
    const sender = identityFromSignature(hexToBytes(v.identityFromSignature.signature));
    assert.equal(hex(sender.public), s.senderPublic);
    const msg = concatBytes(
      utf8ToBytes('pigeon/v1/sender'),
      hexToBytes(v.keySchedule.ephemeralPublic),
      hexToBytes(v.keySchedule.recipientPublic),
      new Uint8Array(8),
      new Uint8Array([0, 5]),
      utf8ToBytes(s.body),
    );
    assert.equal(hex(msg), s.message);
    assert.equal(hex(ed25519.sign(msg, sender.secret)), s.signature);
    assert.ok(ed25519.verify(hexToBytes(s.signature), msg, hexToBytes(s.senderPublic)));
  });

  it('padding', () => {
    v.padding.bodyBytes.forEach((n: number, i: number) => assert.equal(bucketFor(n), v.padding.bucket[i]));
  });

  it('boards', () => {
    assert.equal(boardAddress('public').toBase58(), v.boards.public);
    assert.equal(boardAddress('Public').toBase58(), v.boards.public);
    assert.equal(boardAddress('private').toBase58(), v.boards.private);
  });
});
