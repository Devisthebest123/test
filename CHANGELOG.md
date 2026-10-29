# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-29

First public build.

### Added
- Dead-drop protocol `pigeon/v1`: X25519 + HKDF-SHA256 + XChaCha20-Poly1305, padded to 160/320/576 bytes, posted as Memo transactions tagged to a program-derived board under the Memo program. No custom on-chain program.
- Whisper IDs as bech32m with prefix `wsp` (`wsp1…`), derived from one wallet signature. Identities are Ed25519; key agreement uses the X25519 twin. Legacy base58 IDs still accepted.
- Authenticated sender: a sender who includes their ID signs the drop (ephemeral key, recipient, amount, body) inside the plaintext; recipients show a from line only when it verifies.
- Stealth payments: the drop's shared secret also seeds a one-time Ed25519 wallet that the sender funds in the same transaction and only the recipient can sweep.
- Board, Drop, Inbox (with sweep and key export), Identity, Wallet and Protocol pages. Chaff posting. Auto-scan every minute.
- Cloudflare Worker that serves the static bundle and proxies `/rpc`, keeping the RPC provider key out of the browser and refusing foreign origins.
- Local, devnet and mainnet clusters; a build that names a cluster is pinned to it.
- Headless smoke test (`npm run smoke`) covering note, payment, scan, bystander rejection and sweep against a live validator.
- Test vectors for identity derivation, ID encoding, key schedule, stealth derivation and padding.

### Security
- Not yet independently audited. See THREAT-MODEL.md for what is and is not protected.
