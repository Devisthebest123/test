/**
 * The board: where drops are pinned.
 *
 * A board is a program-derived address under the Memo program. Nobody holds
 * its key. Every drop transaction references it with a zero-lamport transfer,
 * which is enough for `getSignaturesForAddress` to index the transaction, and
 * then writes the sealed envelope with one Memo instruction.
 *
 * Readers pull the board's history and look at every drop. There is no
 * query by recipient, by design: the RPC node learns that you read the
 * board, not which drop you came for.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js';
import {fromMemo, type Envelope} from './protocol.ts';

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const DEFAULT_BOARD = 'public';
export const BOARD_SEED = 'pigeon/v1';

export type Network = 'localnet' | 'devnet' | 'mainnet-beta';

export const NETWORKS: Network[] = ['localnet', 'devnet', 'mainnet-beta'];

const env = (import.meta as unknown as {env?: Record<string, string | undefined>}).env ?? {};

/** Build-time overrides: VITE_NETWORK picks the default cluster, VITE_RPC_* the endpoints. */
/** "proxy" means our own origin's /rpc, served by the worker (or Vite's dev proxy); the key stays server-side. */
function resolve(value: string | undefined, fallback: string): string {
  if (value === 'proxy') return typeof location !== 'undefined' ? `${location.origin}/rpc` : fallback;
  return value || fallback;
}

export const RPC_DEFAULTS: Record<Network, string> = {
  localnet: resolve(env.VITE_RPC_LOCALNET, 'http://127.0.0.1:8899'),
  devnet: resolve(env.VITE_RPC_DEVNET, 'https://api.devnet.solana.com'),
  'mainnet-beta': resolve(env.VITE_RPC_MAINNET, 'https://api.mainnet-beta.solana.com'),
};

/** A build that names a cluster is pinned to it: the switcher still works for the session, but every load starts there. */
/** The project's one public wallet, shown on the Wallet page. Empty until announced. */
export const OFFICIAL_WALLET: string = (env.VITE_OFFICIAL_WALLET || '').trim();

export const NETWORK_PINNED = (['localnet', 'devnet', 'mainnet-beta'] as Network[]).includes(env.VITE_NETWORK as Network);
export const DEFAULT_NETWORK: Network = NETWORK_PINNED ? (env.VITE_NETWORK as Network) : 'devnet';

export const NETWORK_LABEL: Record<Network, string> = {
  localnet: 'LOCAL',
  devnet: 'DEVNET',
  'mainnet-beta': 'MAINNET',
};

export function boardAddress(name: string = DEFAULT_BOARD): PublicKey {
  const seed = Buffer.from(name.normalize('NFKC').toLowerCase(), 'utf8');
  if (seed.length === 0 || seed.length > 32) throw new Error('board name must be 1 to 32 bytes');
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from(BOARD_SEED), seed], MEMO_PROGRAM_ID);
  return pda;
}

/** Anything that can sign a legacy transaction: a wallet adapter or a Keypair wrapper. */
export interface DropSigner {
  publicKey: PublicKey;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

export function dropInstructions(payer: PublicKey, board: PublicKey, memo: string): TransactionInstruction[] {
  return [
    SystemProgram.transfer({fromPubkey: payer, toPubkey: board, lamports: 0}),
    new TransactionInstruction({keys: [], programId: MEMO_PROGRAM_ID, data: Buffer.from(memo, 'utf8')}),
  ];
}

export async function postDrop(
  conn: Connection,
  signer: DropSigner,
  board: PublicKey,
  memo: string,
  extra: TransactionInstruction[] = [],
): Promise<string> {
  const {blockhash, lastValidBlockHeight} = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({feePayer: signer.publicKey, blockhash, lastValidBlockHeight});
  tx.add(...dropInstructions(signer.publicKey, board, memo), ...extra);
  const signed = await signer.signTransaction(tx);
  const signature = await conn.sendRawTransaction(signed.serialize(), {skipPreflight: false, maxRetries: 3});
  const res = await conn.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed');
  if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
  return signature;
}

export type RawDrop = {
  signature: string;
  slot: number;
  /** Unix seconds, when the node knows it. */
  time: number | null;
  payer: string;
  memo: string;
  envelope: Envelope;
};

export type ScanOptions = {
  /** Stop once drops are older than this (unix seconds). */
  since?: number;
  /** Hard cap on signatures to walk. */
  max?: number;
  /** Skip signatures already seen (keyed by signature). */
  known?: Set<string>;
  signal?: AbortSignal;
  onProgress?: (walked: number, found: number) => void;
};

/**
 * Walk the board's history newest-first and return every parseable drop.
 * Transactions that reference the board but carry no Whisper memo are ignored.
 */
export async function scanBoard(conn: Connection, board: PublicKey, opts: ScanOptions = {}): Promise<RawDrop[]> {
  const {since = 0, max = 3000, known, signal, onProgress} = opts;
  const found: RawDrop[] = [];
  const pending: {signature: string; slot: number; time: number | null}[] = [];
  let before: string | undefined;
  let walked = 0;

  outer: while (walked < max) {
    if (signal?.aborted) break;
    const page = await conn.getSignaturesForAddress(board, {before, limit: Math.min(1000, max - walked)}, 'confirmed');
    if (page.length === 0) break;
    for (const s of page) {
      walked++;
      before = s.signature;
      if (s.blockTime != null && s.blockTime < since) break outer;
      if (s.err) continue;
      if (known?.has(s.signature)) continue;
      pending.push({signature: s.signature, slot: s.slot, time: s.blockTime ?? null});
    }
    onProgress?.(walked, found.length);
    if (page.length < 1000) break;
  }

  const CHUNK = 20;
  for (let i = 0; i < pending.length; i += CHUNK) {
    if (signal?.aborted) break;
    const slice = pending.slice(i, i + CHUNK);
    const txs = await conn.getParsedTransactions(
      slice.map((p) => p.signature),
      {maxSupportedTransactionVersion: 0, commitment: 'confirmed'},
    );
    txs.forEach((tx, j) => {
      const drop = tx && parseDrop(tx, slice[j]);
      if (drop) found.push(drop);
    });
    onProgress?.(walked, found.length);
  }
  return found;
}

function parseDrop(
  tx: ParsedTransactionWithMeta,
  meta: {signature: string; slot: number; time: number | null},
): RawDrop | null {
  const ixs = tx.transaction.message.instructions as ParsedInstruction[];
  const memoIx = ixs.find((ix) => ix.programId.equals(MEMO_PROGRAM_ID) && typeof ix.parsed === 'string');
  if (!memoIx) return null;
  const memo = memoIx.parsed as string;
  const envelope = fromMemo(memo);
  if (!envelope) return null;
  return {
    ...meta,
    time: meta.time ?? tx.blockTime ?? null,
    payer: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
    memo,
    envelope,
  };
}

function clusterQuery(network: Network, rpcUrl?: string): string {
  if (network === 'devnet') return '?cluster=devnet';
  if (network === 'localnet') return `?cluster=custom&customUrl=${encodeURIComponent(rpcUrl ?? RPC_DEFAULTS.localnet)}`;
  return '';
}

export function explorerTx(sig: string, network: Network, rpcUrl?: string): string {
  return `https://explorer.solana.com/tx/${sig}${clusterQuery(network, rpcUrl)}`;
}

export function explorerAddress(addr: string, network: Network, rpcUrl?: string): string {
  return `https://explorer.solana.com/address/${addr}${clusterQuery(network, rpcUrl)}`;
}

/** Ask the cluster's faucet for SOL. Public clusters have theirs closed; local validators do not. */
export async function airdrop(conn: Connection, to: PublicKey, sol = 1): Promise<string> {
  let sig: string;
  try {
    sig = await conn.requestAirdrop(to, Math.round(sol * 1_000_000_000));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('410') || /faucet is closed/i.test(msg)) {
      throw new Error('This cluster does not give out test SOL over RPC. Fund the wallet another way.');
    }
    throw e;
  }
  const bh = await conn.getLatestBlockhash('confirmed');
  const res = await conn.confirmTransaction({signature: sig, ...bh}, 'confirmed');
  if (res.value.err) throw new Error('airdrop transaction failed');
  return sig;
}
