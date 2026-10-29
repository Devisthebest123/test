/**
 * Generates docs/test-vectors.json from fixed inputs.
 *
 * The inputs are deliberately obvious byte patterns (01 02 03 …). They are
 * worked examples so that an independent implementation can check it agrees
 * with this one. They are not keys anyone uses for anything.
 *
 * Run: npm run vectors
 */
import {ed25519, edwardsToMontgomeryPub, x25519} from '@noble/curves/ed25519';
import {hkdf} from '@noble/hashes/hkdf';
import {sha256} from '@noble/hashes/sha2';
import {concatBytes, utf8ToBytes} from '@noble/hashes/utils';
import {Keypair} from '@solana/web3.js';
import {writeFileSync} from 'node:fs';
import {
  BUCKETS,
  IDENTITY_MESSAGE,
  MAX_BODY,
  MAX_MEMO_CHARS,
  PLAIN_HEADER_LEN,
  PROTOCOL,
  bucketFor,
  encodeAddress,
  identityFromSecret,
  identityFromSignature,
} from '../src/lib/protocol.ts';
import {boardAddress} from '../src/lib/board.ts';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const seq = (n: number, start = 1) => Uint8Array.from({length: n}, (_, i) => (start + i) & 0xff);

// identity from a fixed seed
const recipient = identityFromSecret(seq(32, 1));
// identity from a fixed 64-byte "signature"
const fromSig = identityFromSignature(seq(64, 0x10));
// key schedule with a fixed ephemeral secret
const esk = seq(32, 0x80);
const epk = x25519.getPublicKey(esk);
const shared = x25519.getSharedSecret(esk, edwardsToMontgomeryPub(recipient.public));
const okm = hkdf(sha256, shared, concatBytes(epk, recipient.public), utf8ToBytes(PROTOCOL), 72);
const key = okm.subarray(0, 32);
const tag = okm.subarray(32, 40);
const seed = okm.subarray(40, 72);
const stealth = Keypair.fromSeed(seed).publicKey.toBase58();

// sender signature over a fixed drop: sender = fromSig, body "hello", no payment
const sender = fromSig;
const body = utf8ToBytes('hello');
const lam = new Uint8Array(8);
const len = new Uint8Array([0, body.length]);
const msg = concatBytes(utf8ToBytes('pigeon/v1/sender'), epk, recipient.public, lam, len, body);
const sig = ed25519.sign(msg, sender.secret);

const vectors = {
  protocol: PROTOCOL,
  magic: 'PGN1',
  note: 'Fixed-input worked examples. Inputs are byte sequences, not real keys.',
  constants: {
    buckets: [...BUCKETS],
    plainHeaderLen: PLAIN_HEADER_LEN,
    maxBody: MAX_BODY,
    maxMemoChars: MAX_MEMO_CHARS,
    identityMessage: IDENTITY_MESSAGE,
  },
  identity: {
    seed: hex(recipient.secret),
    public: hex(recipient.public),
    xPublic: hex(recipient.xPublic),
    id: encodeAddress(recipient.public),
  },
  identityFromSignature: {
    signature: hex(seq(64, 0x10)),
    seed: hex(fromSig.secret),
    public: hex(fromSig.public),
    id: encodeAddress(fromSig.public),
  },
  keySchedule: {
    ephemeralSecret: hex(esk),
    ephemeralPublic: hex(epk),
    recipientPublic: hex(recipient.public),
    recipientXPublic: hex(recipient.xPublic),
    shared: hex(shared),
    key: hex(key),
    tag: hex(tag),
    stealthSeed: hex(seed),
    stealthWallet: stealth,
  },
  senderSignature: {
    senderPublic: hex(sender.public),
    body: 'hello',
    lamports: '0',
    message: hex(msg),
    signature: hex(sig),
  },
  padding: {
    bodyBytes: [0, 53, 54, 213, 214, MAX_BODY],
    bucket: [0, 53, 54, 213, 214, MAX_BODY].map(bucketFor),
  },
  boards: {
    public: boardAddress('public').toBase58(),
    'Public (case-folded)': boardAddress('Public').toBase58(),
    private: boardAddress('private').toBase58(),
  },
};

writeFileSync('docs/test-vectors.json', JSON.stringify(vectors, null, 2) + '\n');
console.log('wrote docs/test-vectors.json');
