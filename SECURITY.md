# Security policy

## Status

The primitives come from audited libraries (`@noble/*`). The protocol and application around them have not yet had an independent audit and are open for review.

## Reporting a vulnerability

Please do not open a public issue for anything that could put users at risk.

Email the maintainers at the address listed on the project's official channels, with `[whisper-security]` in the subject. If you want to encrypt, ask for a PGP key in a first plaintext message and we will send one.

Include what you can: the affected file or behaviour, steps to reproduce, and your assessment of impact. You will get an acknowledgement within 72 hours and a decision on severity and timeline within 7 days. We will credit you in the changelog unless you prefer otherwise.

## Scope

In scope:

- Anything that lets a third party learn who a drop is for, what it says, or which stealth wallet belongs to whom.
- Anything that lets a non-recipient open or forge a drop.
- Key handling in the browser, the identity derivation, the worker's origin check.
- Incorrect claims in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

Out of scope:

- Facts already documented as limitations in the threat model (fee-payer visibility, amounts, timing).
- Issues requiring a compromised browser, extension or operating system.
- Denial of service by posting volume to a public board.
- Vulnerabilities in Solana, wallets or RPC providers themselves.

## Disclosure

We prefer coordinated disclosure: a fix first, then a public note in the changelog describing the issue and crediting the reporter. If we are unresponsive for 30 days, publish.

## No bounty

There is no bug bounty program at this time.
