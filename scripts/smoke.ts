/**
 * End-to-end check against a live cluster, no browser involved:
 *   1. load or create a throwaway payer (.smoke-keypair.json, git-ignored)
 *   2. make sure it has a little SOL (airdrop if the cluster allows it)
 *   3. seal a note to a fresh identity and pin it to the public board
 *   4. seal a payment of 0.5 SOL to the same identity, funding its stealth wallet
 *   5. scan the board, prove only that identity opens both, sweep the SOL out
 *
 * Run with: npm run smoke            (devnet; fund the payer at faucet.solana.com first)
 *           RPC=http://127.0.0.1:8899 npm run smoke   (local validator)
 */
import {Connection, Keypair, LAMPORTS_PER_SOL} from '@solana/web3.js';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {boardAddress, explorerTx, postDrop, scanBoard} from '../src/lib/board.ts';
import {addressedTo, encodeAddress, open, randomIdentity, seal, toMemo} from '../src/lib/protocol.ts';
import {fundInstruction, stealthKeypair, sweep} from '../src/lib/stealth.ts';

const RPC = process.env.RPC ?? 'https://api.devnet.solana.com';
const KEY_FILE = '.smoke-keypair.json';
const local = /127\.0\.0\.1|localhost/.test(RPC);
const net = local ? 'localnet' : 'devnet';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = existsSync(KEY_FILE)
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEY_FILE, 'utf8'))))
    : Keypair.generate();
  if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, JSON.stringify(Array.from(payer.secretKey)));
  console.log('payer   ', payer.publicKey.toBase58());

  let balance = await conn.getBalance(payer.publicKey);
  if (balance < 0.6 * LAMPORTS_PER_SOL) {
    console.log('balance low, requesting airdrop...');
    try {
      const sig = await conn.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL);
      const bh = await conn.getLatestBlockhash();
      await conn.confirmTransaction({signature: sig, ...bh}, 'confirmed');
    } catch (e) {
      console.error('airdrop failed:', (e as Error).message);
      console.error(`fund ${payer.publicKey.toBase58()} with at least 0.6 SOL and rerun`);
      process.exit(1);
    }
    balance = await conn.getBalance(payer.publicKey);
  }
  console.log('balance ', balance / LAMPORTS_PER_SOL, 'SOL');

  const board = boardAddress('public');
  console.log('board   ', board.toBase58());

  const sender = randomIdentity();
  const recipient = randomIdentity();
  const bystander = randomIdentity();
  console.log('to      ', encodeAddress(recipient.public));

  const signer = {
    publicKey: payer.publicKey,
    signTransaction: async (tx: any) => {
      tx.sign(payer);
      return tx;
    },
  };

  // --- a note
  const body = `smoke ${new Date().toISOString()}: the package is under the bench`;
  const noteSealed = seal(recipient.public, body, sender);
  let t0 = Date.now();
  const noteSig = await postDrop(conn, signer, board, toMemo(noteSealed.envelope));
  console.log('note    ', explorerTx(noteSig, net, RPC), `(${Date.now() - t0}ms)`);

  // --- a payment with a short note
  const lamports = BigInt(0.5 * LAMPORTS_PER_SOL);
  const paySealed = seal(recipient.public, 'for the thing', sender, lamports);
  const stealth = stealthKeypair(paySealed.stealthSeed).publicKey;
  t0 = Date.now();
  const paySig = await postDrop(conn, signer, board, toMemo(paySealed.envelope), [
    fundInstruction(payer.publicKey, paySealed.stealthSeed, lamports),
  ]);
  console.log('payment ', explorerTx(paySig, net, RPC), `(${Date.now() - t0}ms)`);
  console.log('stealth ', stealth.toBase58(), 'funded with', Number(lamports) / LAMPORTS_PER_SOL, 'SOL');

  // --- scan as the recipient
  const drops = await scanBoard(conn, board, {max: 200, since: Math.floor(Date.now() / 1000) - 3600});
  console.log('scanned ', drops.length, 'drops in the last hour');
  const noteDrop = drops.find((d) => d.signature === noteSig);
  const payDrop = drops.find((d) => d.signature === paySig);
  if (!noteDrop || !payDrop) throw new Error('posted drops not found on the board');

  for (const d of [noteDrop, payDrop]) {
    if (!addressedTo(recipient, d.envelope)) throw new Error('recipient tag mismatch');
    if (addressedTo(bystander, d.envelope)) throw new Error('bystander matched tag');
    if (open(bystander, d.envelope)) throw new Error('bystander decrypted');
  }
  const note = open(recipient, noteDrop.envelope);
  if (!note || note.body !== body || note.lamports !== 0n) throw new Error('note mismatch');
  console.log('opened  ', JSON.stringify(note.body));

  const pay = open(recipient, payDrop.envelope);
  if (!pay || pay.lamports !== lamports) throw new Error('payment mismatch');
  const derived = stealthKeypair(pay.stealthSeed).publicKey;
  if (!derived.equals(stealth)) throw new Error('recipient derived a different stealth wallet');
  const sitting = await conn.getBalance(stealth, 'confirmed');
  console.log('derived ', derived.toBase58(), 'holds', sitting / LAMPORTS_PER_SOL, 'SOL');
  if (sitting !== Number(lamports)) throw new Error('stealth balance mismatch');

  // --- sweep to a fresh wallet
  const fresh = Keypair.generate();
  t0 = Date.now();
  const swept = await sweep(conn, pay.stealthSeed, fresh.publicKey);
  const landed = await conn.getBalance(fresh.publicKey, 'confirmed');
  console.log('swept   ', swept.lamports / LAMPORTS_PER_SOL, 'SOL →', fresh.publicKey.toBase58(), `(${Date.now() - t0}ms)`);
  if (landed !== swept.lamports) throw new Error('sweep did not land');
  console.log('empty   ', (await conn.getBalance(stealth, 'confirmed')) === 0 ? 'stealth wallet closed' : 'stealth wallet NOT empty');
  console.log('sender  ', pay.sender ? encodeAddress(pay.sender) : 'anonymous');
  console.log('\nOK');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
