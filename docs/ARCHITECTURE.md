# Architecture

## In one picture

```
 browser (static app)                     Cloudflare Worker              Solana RPC         Solana
 ┌──────────────────────────┐             ┌─────────────────┐            ┌──────────┐      ┌────────┐
 │ protocol.ts  seal/open   │  POST /rpc  │ static assets   │  + key     │ provider │      │ Memo   │
 │ stealth.ts   wallets     │ ──────────▶ │ /rpc proxy      │ ─────────▶ │  (RPC)   │ ───▶ │ System │
 │ board.ts     post/scan   │  wss /rpc   │ origin check    │            └──────────┘      └────────┘
 │ wallet adapter (Phantom) │             └─────────────────┘
 └──────────────────────────┘
```

There is no database, no account system and no application server. The worker exists only to serve files and to keep the RPC provider key out of the bundle. Remove it and the app still works against any RPC URL you paste into Settings.

## Why no on-chain program

A dead drop needs three things from the chain: a place to write bytes, a way to list everything written there, and permanence. Solana's Memo program gives the first and third. For the second, every drop references a program-derived address (the *board*) with a zero-lamport transfer, which puts the board into the transaction's account keys and makes `getSignaturesForAddress` return the full history. No deploy, no upgrade authority, no program to audit or trust, and nothing to pay rent on.

The cost is read efficiency: clients walk signatures and fetch transactions in batches. For the volumes a board sees today this is fine; an indexer (see below) is the upgrade path.

## Layers

### `src/lib/protocol.ts` (pure)
Everything cryptographic: identities, IDs, key schedule, padding, sealing, opening, wire format, chaff. No imports from the DOM or Solana. Runs under Node for tests and vectors. If you are auditing, start here; it is under 300 lines.

### `src/lib/board.ts`, `src/lib/stealth.ts` (Solana)
Board address derivation, transaction assembly, scanning, explorer links, stealth-wallet derivation, funding and sweeping. Thin wrappers over `@solana/web3.js`.

### `src/lib/identity.ts`, `src/lib/store.ts`
Where identities come from (wallet signature, burner keypair, import) and small fail-soft wrappers over web storage.

### `src/state/AppContext.tsx`
One provider holding settings (cluster, RPC URL, board name), identity, the active signer (wallet or burner), the board cache and the auto-scan loop. Pages read from it; nothing else holds state.

### `src/pages/*`
Home (hero and explainer), Board (the raw feed, yours inverted), Drop (compose), Inbox (opened notes and payments, with sweep), Identity (wallet, ID, network), Wallet (the project's single official wallet), Protocol (spec rendered in-app).

### `worker/index.ts`
Serves `dist/` as static assets. Requests to `/rpc` are forwarded to the `RPC_URL` secret, including WebSocket upgrades (web3.js uses them for confirmations). Any `Origin` other than the worker's own is refused.

## Data flow of one payment

1. Drop page: `seal(recipient, body, sender, lamports)` → envelope + stealth seed.
2. `fundInstruction(payer, seed, lamports)` → `System.transfer` to `Keypair.fromSeed(seed).publicKey`.
3. `postDrop(conn, signer, board, memo, [fund])` → one transaction, signed by the wallet, sent via `/rpc`.
4. Recipient's auto-scan: `scanBoard` → new `RawDrop`s → `open(identity, envelope)` → `Note` with `lamports` and `stealthSeed`.
5. Inbox: balance of the stealth wallet; `sweep(conn, seed, destination)` moves it and closes the account.

## Storage

All client-side, prefixed `whisper.`: settings, the identity secret (session storage by default, local storage if "remember"), a burner keypair if one was made, a cache of raw drops per cluster and board, and the set of read signatures. Nothing is ever sent anywhere except the signed transactions.

## Build and configuration

Vite 6, React 19, Tailwind 4, TypeScript strict. `import.meta.env.VITE_NETWORK` pins the default cluster; `VITE_RPC_*` set endpoints, where the value `proxy` means "this origin's `/rpc`". `RPC_URL` (no `VITE_` prefix) is read only by the dev proxy and the worker secret, and never enters the bundle. A build that pins a cluster starts on it every load.

## Upgrade paths, in order of value

1. **Indexer.** A scheduled worker that walks the board into KV so clients load one file instead of hundreds of RPC calls. Privacy-neutral: it is the whole board.
2. **Relayer.** Clients hand a signed drop to a worker that pays the fee, hiding the sender's wallet. Needs a funding model.
3. **Diversified IDs.** Many unlinkable IDs from one secret, as Zcash does.
4. **Payment chaff.** Dust payments to random stealth wallets so payment drops stop being distinguishable from notes.
