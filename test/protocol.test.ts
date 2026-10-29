import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  BUCKETS,
  KEY_LEN,
  MAX_BODY,
  MAX_MEMO_CHARS,
  PLAIN_HEADER_LEN,
  SIG_LEN,
  addressedTo,
  chaff,
  decodeAddress,
  encodeAddress,
  fromMemo,
  identityFromSignature,
  isAddress,
  open,
  randomIdentity,
  seal,
  sealPlaintext,
  toMemo,
} from '../src/lib/protocol.ts';
import {parseSol, stealthKeypair} from '../src/lib/stealth.ts';

describe('addresses', () => {
  it('round-trip and reject corruption', () => {
    const id = randomIdentity();
    const addr = encodeAddress(id.public);
    assert.deepEqual(decodeAddress(addr), id.public);
    assert.ok(isAddress(addr));
    assert.ok(!isAddress(addr.slice(0, -1) + (addr.endsWith('1') ? '2' : '1')));
    assert.ok(!isAddress('11111111111111111111111111111111'));
  });

  it('reads as wsp1…, never like a wallet', () => {
    const id = randomIdentity();
    const addr = encodeAddress(id.public);
    assert.ok(addr.startsWith('wsp1'));
    assert.equal(addr, addr.toLowerCase());
    assert.ok(isAddress(addr.toUpperCase()));
    assert.ok(isAddress(`whisper:${addr}`));
    assert.ok(!isAddress('7J9nxx2hPpiQc9pymF4kFYwicsyUBzDYVJDXCEPHhJuN'));
  });

  it('is deterministic from a signature', () => {
    const sig = new Uint8Array(64).fill(7);
    assert.deepEqual(identityFromSignature(sig).public, identityFromSignature(sig).public);
    assert.notDeepEqual(identityFromSignature(sig).public, identityFromSignature(new Uint8Array(64).fill(8)).public);
  });
});

describe('notes', () => {
  it('only the recipient can open, and sees a verified sender', () => {
    const alice = randomIdentity();
    const bob = randomIdentity();
    const eve = randomIdentity();
    const {envelope} = seal(bob.public, 'the package is under the bench', alice);
    const back = fromMemo(toMemo(envelope))!;
    assert.ok(back);
    assert.ok(addressedTo(bob, back));
    assert.ok(!addressedTo(eve, back));
    assert.ok(!addressedTo(alice, back));
    const note = open(bob, back)!;
    assert.equal(note.body, 'the package is under the bench');
    assert.deepEqual(note.sender, alice.public);
    assert.equal(note.senderForged, false);
    assert.equal(note.lamports, 0n);
    assert.equal(open(eve, back), null);
  });

  it('anonymous drops carry no sender', () => {
    const bob = randomIdentity();
    const note = open(bob, seal(bob.public, 'hi', null).envelope)!;
    assert.equal(note.sender, null);
    assert.equal(note.senderForged, false);
  });

  it('a forged sender claim is rejected and reported', () => {
    const alice = randomIdentity();
    const bob = randomIdentity();
    const mallory = randomIdentity();
    // Mallory lays out a plaintext claiming to be Alice, signed with her own key.
    const text = new TextEncoder().encode('send the money to this address');
    const plain = new Uint8Array(BUCKETS[0]);
    plain[0] = 1;
    plain.set(alice.public, 1);
    // signature slot: whatever Mallory can produce is not Alice's
    plain.set(new Uint8Array(SIG_LEN).fill(0xab), 1 + KEY_LEN);
    plain[1 + KEY_LEN + SIG_LEN + 8] = text.length >> 8;
    plain[2 + KEY_LEN + SIG_LEN + 8] = text.length & 0xff;
    plain.set(text, PLAIN_HEADER_LEN);
    const {envelope} = sealPlaintext(bob.public, plain);
    const note = open(bob, envelope)!;
    assert.ok(note);
    assert.equal(note.body, 'send the money to this address');
    assert.equal(note.sender, null);
    assert.equal(note.senderForged, true);
    assert.notDeepEqual(mallory.public, alice.public);
  });

  it('a genuine sender signature does not transplant to another drop', () => {
    const alice = randomIdentity();
    const bob = randomIdentity();
    const carol = randomIdentity();
    // Alice really signs a drop to Bob. Mallory cannot reuse that plaintext for Carol:
    // the signature binds the recipient and the ephemeral key.
    const real = seal(bob.public, 'for bob', alice);
    const opened = open(bob, real.envelope)!;
    assert.deepEqual(opened.sender, alice.public);
    // Re-sealing the same claim to Carol under a new ephemeral key breaks the signature.
    const text = new TextEncoder().encode('for bob');
    const plain = new Uint8Array(BUCKETS[0]);
    plain[0] = 1;
    plain.set(alice.public, 1);
    plain[1 + KEY_LEN + SIG_LEN + 8] = text.length >> 8;
    plain[2 + KEY_LEN + SIG_LEN + 8] = text.length & 0xff;
    plain.set(text, PLAIN_HEADER_LEN);
    const moved = open(carol, sealPlaintext(carol.public, plain).envelope)!;
    assert.equal(moved.sender, null);
    assert.equal(moved.senderForged, true);
  });

  it('pads to buckets and enforces the cap', () => {
    const bob = randomIdentity();
    assert.equal(open(bob, seal(bob.public, '', null).envelope)!.bucket, BUCKETS[0]);
    assert.equal(open(bob, seal(bob.public, 'a'.repeat(100), null).envelope)!.bucket, BUCKETS[1]);
    assert.equal(open(bob, seal(bob.public, 'a'.repeat(MAX_BODY), null).envelope)!.bucket, BUCKETS[2]);
    assert.throws(() => seal(bob.public, 'a'.repeat(MAX_BODY + 1), null));
    assert.ok(toMemo(seal(bob.public, 'a'.repeat(MAX_BODY), null).envelope).length <= MAX_MEMO_CHARS);
  });

  it('handles multibyte text', () => {
    const bob = randomIdentity();
    const text = 'π ≈ 3.14159 — 鳩は見ていない 🕊';
    assert.equal(open(bob, seal(bob.public, text, null).envelope)!.body, text);
  });

  it('tampering fails closed', () => {
    const bob = randomIdentity();
    const {envelope} = seal(bob.public, 'meet at nine', null);
    envelope.ciphertext[5] ^= 1;
    assert.equal(open(bob, envelope), null);
  });

  it('chaff parses but opens for nobody', () => {
    const bob = randomIdentity();
    const env = fromMemo(toMemo(chaff()))!;
    assert.ok(env);
    assert.equal(open(bob, env), null);
  });

  it('rejects foreign memos quickly', () => {
    assert.equal(fromMemo('hello world'), null);
    assert.equal(fromMemo(''), null);
    assert.equal(fromMemo('UEdOMQ=='), null);
  });
});

describe('payments', () => {
  it('sender and recipient derive the same stealth wallet', () => {
    const alice = randomIdentity();
    const bob = randomIdentity();
    const sealed = seal(bob.public, 'rent', alice, 1_500_000_000n);
    const note = open(bob, sealed.envelope)!;
    assert.equal(note.lamports, 1_500_000_000n);
    assert.deepEqual(note.sender, alice.public);
    assert.deepEqual(note.stealthSeed, sealed.stealthSeed);
    const a = stealthKeypair(sealed.stealthSeed).publicKey.toBase58();
    const b = stealthKeypair(note.stealthSeed).publicKey.toBase58();
    assert.equal(a, b);
  });

  it('every drop gets a different stealth wallet, even to the same recipient', () => {
    const bob = randomIdentity();
    const one = seal(bob.public, '', null, 1_000_000n);
    const two = seal(bob.public, '', null, 1_000_000n);
    assert.notDeepEqual(one.stealthSeed, two.stealthSeed);
  });

  it('a payment without a note is fine, and amounts survive the u64 round trip', () => {
    const bob = randomIdentity();
    const big = 18_446_744_073_709_551_615n;
    assert.equal(open(bob, seal(bob.public, '', null, big).envelope)!.lamports, big);
    assert.throws(() => seal(bob.public, '', null, -1n));
  });

  it('a bystander cannot derive the wallet', () => {
    const bob = randomIdentity();
    const eve = randomIdentity();
    const sealed = seal(bob.public, '', null, 1_000_000n);
    assert.equal(open(eve, sealed.envelope), null);
  });

  it('parses SOL amounts exactly', () => {
    assert.equal(parseSol('1'), 1_000_000_000n);
    assert.equal(parseSol('0.001'), 1_000_000n);
    assert.equal(parseSol('2.123456789'), 2_123_456_789n);
    assert.equal(parseSol('.5'), 500_000_000n);
    assert.equal(parseSol('abc'), null);
    assert.equal(parseSol('1.1234567891'), null);
  });
});
