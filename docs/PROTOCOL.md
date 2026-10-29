# Whisper protocol, version 1

Wire identifier: `pigeon/v1` (the project's original name; kept so sealed drops stay valid). Magic bytes: `PGN1`.

This document is normative for interoperating implementations. The reference implementation is [`src/lib/protocol.ts`](../src/lib/protocol.ts); it is pure TypeScript with no DOM or Solana dependency and is exercised by `npm test`. Reproducible worked examples are in [`test-vectors.json`](test-vectors.json).

## 1. Primitives

| Purpose | Primitive |
|---|---|
| Identity and signatures | Ed25519 (RFC 8032) |
| Key agreement | X25519 (RFC 7748) on the birational twin of the identity key (§4.1) |
| Key derivation | HKDF-SHA256 (RFC 5869) |
| Authenticated encryption | XChaCha20-Poly1305 (24-byte nonce) |
| ID checksum and encoding | bech32m (BIP-350), human-readable part `wsp` |
| One-time wallets | Ed25519 keypair from a 32-byte seed (Solana `Keypair.fromSeed`) |

All multi-byte integers are big-endian.

## 2. Identities and Whisper IDs

An identity is an Ed25519 keypair: a 32-byte seed `sk` and `pk = Ed25519.pubkey(sk)`. For key agreement the implementation derives the X25519 twin: `sk_x = clamp(SHA512(sk)[0..32])` and `pk_x = (1+y)/(1−y)` from the Edwards `y` coordinate (RFC 7748 §4.1). `pk`, not `pk_x`, is the Whisper ID and is what appears in salts and signatures.

### 2.1 Derivation from a wallet signature

A wallet signs the UTF-8 message:

```
Whisper identity (v1)

Signing this message derives your drop address from your wallet.
It costs nothing and moves no funds. Sign it only on Whisper pages you trust.
```

Given the 64-byte Ed25519 signature `sig`:

```
sk = HKDF-SHA256(ikm = sig, salt = "pigeon/v1", info = "identity", L = 32)
```

Ed25519 signatures are deterministic (RFC 8032), so the same wallet yields the same identity.

### 2.2 Encoding

```
id = bech32m("wsp", pk)          # 32 bytes → 52 data chars; total "wsp1" + 58 chars
```

IDs are lowercase. Decoders accept uppercase (bech32 rule: all one case) and an optional `whisper:` URI prefix. Decoders SHOULD also accept the legacy form `base58(0x01 || pk || SHA256(SHA256(0x01 || pk))[0..4])`, which earlier builds emitted.

## 3. Key schedule

Per drop, the sender generates an ephemeral keypair `(esk, epk)`.

```
shared = X25519(esk, recipient_pk_x)                  # sender
shared = X25519(recipient_sk_x, epk)                  # recipient
okm    = HKDF-SHA256(ikm = shared,
                     salt = epk || recipient_pk,          # the Ed25519 ID, not pk_x
                     info = "pigeon/v1",
                     L = 72)
key    = okm[0..32]      # AEAD key
tag    = okm[32..40]     # 8-byte "is this mine" check
seed   = okm[40..72]     # Ed25519 seed of the one-time wallet
```

The ephemeral secret MUST be discarded after sealing. It is never written anywhere.

## 4. Plaintext

Padded to the smallest bucket of **160, 320 or 576** bytes that fits. The largest bucket keeps a payment transaction under Solana's 1,232-byte limit with one signer.

```
offset  size  field
0       1     flags       bit0 = sender present, bit1 = payment
1       32    sender_pk   sender's Ed25519 identity key, or 32 zero bytes
33      64    signature   Ed25519 signature, or 64 zero bytes
97      8     lamports    u64, zero when bit1 is clear
105     2     length      u16, byte length of body
107     n     body        UTF-8, n ≤ 469
107+n   *     padding     zero bytes to the bucket boundary
```

Decoders MUST reject a plaintext whose `107 + length` exceeds the bucket.

### 4.1 Sender signature

When bit0 is set, `signature` MUST be a valid Ed25519 signature by `sender_pk` over

```
"pigeon/v1/sender" || epk || recipient_pk || lamports(8) || length(2) || body
```

where `epk` is the envelope's ephemeral key and `recipient_pk` is the recipient's Ed25519 ID. Including `epk` binds the claim to one drop; including `recipient_pk` prevents a valid claim from being re-sealed to a different recipient. Recipients MUST verify before presenting a sender, and MUST treat a drop whose signature fails as anonymous (reporting the failure is recommended). Senders who wish to remain anonymous leave bit0 clear and both fields zero.

## 5. Envelope

```
offset  size  field
0       4     magic       "PGN1"
4       32    epk
36      8     tag
44      24    nonce       random
68      m     ciphertext  XChaCha20-Poly1305(key, nonce, aad, plaintext); m = bucket + 16
```

```
aad = magic || epk || tag
```

The memo text is `base64(envelope)`, standard alphabet with padding. The longest possible memo is 880 characters.

## 6. Transaction

A drop is one legacy Solana transaction with one signer, the fee payer:

```
ix 0   System.transfer( payer → board, 0 lamports )
ix 1   Memo( memo text )                                   program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
ix 2   System.transfer( payer → stealth, lamports )        only when flags.bit1 is set
```

### 6.1 The board

```
board = find_program_address( [ "pigeon/v1", lower(nfkc(name)) ], MemoProgram )
```

`name` is 1 to 32 bytes; the default board is `public`. Nobody holds the board's key. The zero-lamport transfer exists only so that the board appears in the transaction's account keys, which is what makes `getSignaturesForAddress(board)` list every drop.

### 6.2 The stealth wallet

```
stealth = Ed25519Keypair.fromSeed(seed).publicKey
```

The transfer MUST be at least the rent-exempt minimum for an empty account (890,880 lamports on mainnet at the time of writing); the reference implementation enforces 1,000,000 lamports. Sweeping transfers `balance − 5,000` lamports from the stealth wallet, which pays its own fee and closes at zero.

## 7. Reading

```
for each signature in getSignaturesForAddress(board), newest first, within the window:
    tx = getTransaction(signature)
    memo = first Memo instruction's text
    env = parse(base64decode(memo));  skip if magic ≠ "PGN1"
    shared = X25519(sk_x, env.epk)
    (key, tag, seed) = HKDF(...)
    if tag ≠ env.tag: continue
    plaintext = AEAD.open(key, env.nonce, aad, env.ciphertext);  skip on failure
    if plaintext.flags.bit0: verify sender signature; on failure treat as anonymous
```

The tag is a cheap first pass. A false match is a 2⁻⁶⁴ event and fails decryption anyway. Implementations MUST fetch the entire window, never a subset selected by anything derived from the recipient's key.

## 8. Chaff

A chaff drop is `seal(random_pk, body, sender = none)` with a random body length drawn from the bucket sizes. It is structurally identical to a real drop and MUST NOT be distinguishable by any field. It is typically posted with no payment instruction, which means payment drops are distinguishable from note-only drops on chain by the presence of `ix 2`; see the threat model.

## 9. Test vectors

[`test-vectors.json`](test-vectors.json) is generated by `npm run vectors` from fixed inputs and checked by `test/vectors.test.ts`. The inputs are the byte sequences `01 02 … 20` and similar; they are examples, not keys anyone uses. An independent implementation that reproduces every value in that file agrees with this one on identity derivation (including the X25519 twin), ID encoding, the key schedule, the sender signature, stealth-wallet derivation and padding. Encryption itself is randomised (ephemeral key and nonce) and is covered by round-trip tests rather than fixed vectors.

## 10. Versioning

Any change to the magic, the key schedule, the plaintext layout or the board seed is a new version with a new magic. Readers ignore memos whose magic they do not recognise.
