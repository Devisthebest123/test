# Contributing

Thanks for looking. A few rules keep this small codebase honest.

## Before you start

- Read [docs/PROTOCOL.md](docs/PROTOCOL.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md). Most useful contributions either strengthen a guarantee or correct a claim.
- Security issues go through [SECURITY.md](SECURITY.md), not the issue tracker.

## Ground rules

1. **`src/lib/protocol.ts` stays pure.** No DOM, no Solana, no network. It must run under plain Node. Anything that touches the chain belongs in `board.ts` or `stealth.ts`.
2. **No change to the wire format without a version bump.** Magic, key schedule, plaintext layout and board seed are frozen for `PGN1`. A new layout is a new magic.
3. **Keys never leave the browser.** No telemetry, no analytics, no third-party scripts. If a feature needs a server, write down in the PR what that server learns.
4. **Every claim in the docs is a test or a known limitation.** If you add a privacy property, add the test. If you find one that does not hold, move it to the threat model.
5. **Dependencies are a liability.** Prefer the standard library. New crypto comes only from `@noble/*`.

## Workflow

```bash
npm install
npm test            # unit tests + vectors; must pass
npm run lint        # tsc --noEmit; must be clean
npm run build       # must build
```

If you touch the key schedule, IDs or padding, regenerate the vectors and explain the diff:

```bash
npm run vectors
```

For anything that posts to a chain, run the smoke test against a local validator:

```bash
solana-test-validator --reset --log
RPC=http://127.0.0.1:8899 npm run smoke
```

## Pull requests

- One change per PR. Say what it does in the first line and why in the body.
- Keep the style: Prettier defaults, no semicolon games, comments explain intent not mechanics.
- Screenshots for anything visual. The design system is paper, ink, pixel headlines, mono body, no colour, no radius. Do not add colour.
- Update `CHANGELOG.md` under *Unreleased*.

## Design notes

The site deliberately looks like a document, not an app. Rules, blocks and dither are the only decoration. Copy is plain and does not oversell; "what the chain learns" is a table on the home page on purpose. Keep it that way.
