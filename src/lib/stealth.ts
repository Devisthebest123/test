/**
 * Stealth payments: the Solana side of a payment drop.
 *
 * A stealth wallet is an ordinary ed25519 keypair whose seed came out of the
 * drop's shared secret. The sender funds its address; the recipient, who can
 * derive the same seed, sweeps it wherever they like. Nothing on chain ties
 * that address to the recipient's Whisper ID or to any other payment.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

/** A fresh account must end up rent-exempt (about 0.00089 SOL), so we ask for a round minimum. */
export const MIN_PAYMENT_LAMPORTS = 1_000_000; // 0.001 SOL
export const SWEEP_FEE_LAMPORTS = 5_000;

export function stealthKeypair(seed: Uint8Array): Keypair {
  return Keypair.fromSeed(seed);
}

/** Instruction that funds the stealth wallet; goes in the same transaction as the memo. */
export function fundInstruction(payer: PublicKey, seed: Uint8Array, lamports: bigint): TransactionInstruction {
  if (lamports < BigInt(MIN_PAYMENT_LAMPORTS)) {
    throw new Error(`minimum payment is ${MIN_PAYMENT_LAMPORTS / LAMPORTS_PER_SOL} SOL`);
  }
  return SystemProgram.transfer({fromPubkey: payer, toPubkey: stealthKeypair(seed).publicKey, lamports});
}

/** Move everything out of a stealth wallet. The wallet pays its own fee and closes at zero. */
export async function sweep(
  conn: Connection,
  seed: Uint8Array,
  to: PublicKey,
): Promise<{signature: string; lamports: number}> {
  const kp = stealthKeypair(seed);
  const balance = await conn.getBalance(kp.publicKey, 'confirmed');
  const amount = balance - SWEEP_FEE_LAMPORTS;
  if (amount <= 0) throw new Error('nothing to sweep');
  const {blockhash, lastValidBlockHeight} = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({feePayer: kp.publicKey, blockhash, lastValidBlockHeight});
  tx.add(SystemProgram.transfer({fromPubkey: kp.publicKey, toPubkey: to, lamports: amount}));
  tx.sign(kp);
  const signature = await conn.sendRawTransaction(tx.serialize());
  const res = await conn.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed');
  if (res.value.err) throw new Error(`sweep failed: ${JSON.stringify(res.value.err)}`);
  return {signature, lamports: amount};
}

/** Secret key in the format Phantom and the Solana CLI import, for spending without sweeping. */
export function exportStealthKey(seed: Uint8Array): string {
  return bs58.encode(stealthKeypair(seed).secretKey);
}

export const sol = (lamports: number | bigint, digits = 4) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(digits);

export function parseSol(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d*(\.\d{0,9})?$/.test(t) || t === '' || t === '.') return null;
  const [whole = '0', frac = ''] = t.split('.');
  return BigInt(whole) * BigInt(LAMPORTS_PER_SOL) + BigInt((frac + '000000000').slice(0, 9));
}
