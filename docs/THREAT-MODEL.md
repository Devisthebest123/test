# Threat model

This is the honest version. If a claim here is wrong, that is a security bug; report it per [SECURITY.md](../SECURITY.md).

## Goals

1. **Recipient privacy.** Nothing on chain, and nothing an RPC node observes, reveals who a drop is for.
2. **Content privacy.** Nothing reveals what a drop says.
3. **Payment unlinkability.** A payment cannot be linked to the recipient's Whisper ID, to the recipient's other payments, or to any wallet they control, until they choose to move the funds.
4. **Reader privacy.** Reading the board reveals that you read the board, not which drop you wanted.

## Non-goals

- Hiding that a given wallet posted a drop (the fee payer is public).
- Hiding amounts.
- Hiding timing.
- Protecting a compromised browser or operating system.
- Deniability of having used Whisper at all.

## Adversaries

| Adversary | Sees |
|---|---|
| **Chain observer** (anyone with an explorer) | Every transaction: fee payer, board, memo bytes, stealth-wallet address and amount, block time. |
| **RPC operator** (the node you talk to, or the worker proxying to it) | Everything a chain observer sees, plus your IP, your request timing, and which methods you call. With the worker in front, the provider sees the worker's IP, not yours. |
| **Global passive observer** | IP-level timing of your traffic to the RPC endpoint and the site. |
| **Someone who has your Whisper secret** | Every drop ever sealed to you, forever, and every stealth wallet's key. |
| **Someone who has your wallet** | Can re-derive your Whisper secret by signing the identity message. |

## What holds

- **No recipient on chain.** The only recipient-dependent value in a drop is the 8-byte tag, computable only with the recipient's secret or the sender's ephemeral secret, which is destroyed.
- **Unlinkable drops.** Each drop uses a fresh ephemeral key. Two drops to the same recipient share no visible value.
- **Padded length.** Only the bucket (160/320/576) is visible.
- **Stealth payments.** The funded address is derived from the shared secret and appears nowhere else. An observer sees a never-before-seen wallet receive SOL.
- **Whole-board reads.** The reference client always fetches the entire window. There is no per-recipient query for a node to log.
- **Forward secrecy, sender side.** A sender who loses their device afterwards leaks nothing: the ephemeral secret is gone.
- **Sender authenticity, when claimed.** A from line is shown only if the sender's Ed25519 signature over this exact drop (ephemeral key, recipient, amount, body) verifies. A forged or transplanted claim is discarded and flagged. The signature is inside the ciphertext, so it costs no anonymity.

## What does not hold, and what to do about it

### Replay
Anyone can re-post an existing memo. The recipient sees a duplicate with a new signature and time. No information leaks; it is a nuisance.
*Mitigation:* clients should deduplicate by ephemeral key.

### Fee-payer linkage
The wallet paying the fee is public. If it is your everyday wallet, an observer learns that *you* posted *something* at that time, and, for a payment, how much left your wallet.
*Mitigation:* pay from a wallet funded in a way that does not trace to you. A burner funded by an exchange withdrawal is still linked to that exchange account.

### Payment drops are distinguishable from notes
A payment transaction has a third instruction. An observer can count payments and read amounts, though not recipients.
*Mitigation:* none in v1. Chaff with dust payments would cost rent-exempt minimums per drop.

### Amount fingerprinting
Amounts are public. Repeated unusual amounts form a signature.
*Mitigation:* round numbers.

### Timing correlation
If you post at 14:02 and your contact scans at 14:03 every day, a patient RPC operator can correlate. The reference client auto-scans every minute while open, which helps, and chaff blurs posting patterns, but this is the same unsolved problem Tor has.
*Mitigation:* irregular hours, chaff, long-lived scanning sessions, running through Tor.

### Sweep linkage
Moving stealth funds into a known wallet links that stealth wallet, and therefore that payment, to you from that moment on.
*Mitigation:* sweep to fresh wallets, or spend directly from the stealth key (the inbox exports it).

### No recipient-side forward secrecy
Your Whisper secret decrypts every drop ever sealed to you. Drops are permanent on chain.
*Mitigation:* rotate IDs. Deriving a new one is one signature with a different wallet.

### Endpoint compromise
Keys live in the browser. A malicious extension, a tampered build, or a compromised machine reads them.
*Mitigation:* verify the build, run it locally, keep the identity session-only when on a shared machine.

### RPC trust
The RPC node (or the worker in front of it) can lie by omission: it can hide drops from a scan. It cannot forge a drop that opens (authenticated encryption) or learn who a drop is for.
*Mitigation:* scan through more than one endpoint if you suspect censorship.

### Denial of service
Anyone can post junk to the public board and inflate scan cost. Readers must parse everything.
*Mitigation:* private boards (any name hashes to its own board), scan windows, an indexer.

## Cryptographic assumptions

Standard: X25519 (CDH on Curve25519), HKDF-SHA256 as a PRF, XChaCha20-Poly1305 as an AEAD, Ed25519. The implementation uses `@noble/curves`, `@noble/ciphers` and `@noble/hashes`, which are audited; the protocol around them is not.

## Review status

Primitives are from audited libraries. The protocol and application have not yet had an independent audit; this document is the current statement of what is and is not protected.
