import {PublicKey} from '@solana/web3.js';
import {useEffect, useState} from 'react';
import {Button, Copy, Notice, PageTitle, ago, utc} from '../components/ui';
import {href} from '../hooks/useHashRoute';
import {explorerAddress, explorerTx, type RawDrop} from '../lib/board';
import {shortKey} from '../lib/identity';
import {encodeAddress, type Note} from '../lib/protocol';
import {exportStealthKey, sol, stealthKeypair, sweep} from '../lib/stealth';
import {useApp} from '../state/AppContext';

/** The money side of a payment drop: where it sits, how much is left, and how to take it. */
function Payment({note, tick}: {note: Note; tick: number}) {
  const {connection, network, rpcUrl, signer} = useApp();
  const wallet = stealthKeypair(note.stealthSeed).publicKey;
  const [balance, setBalance] = useState<number | null>(null);
  const [dest, setDest] = useState(signer?.publicKey.toBase58() ?? '');
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let live = true;
    connection
      .getBalance(wallet, 'confirmed')
      .then((b) => live && setBalance(b))
      .catch(() => live && setBalance(null));
    return () => {
      live = false;
    };
  }, [connection, wallet, tick, bump]);

  useEffect(() => {
    if (!dest && signer) setDest(signer.publicKey.toBase58());
  }, [signer, dest]);

  let destOk = false;
  try {
    destOk = !!dest && PublicKey.isOnCurve(new PublicKey(dest).toBytes());
  } catch {
    destOk = false;
  }
  const swept = balance != null && balance === 0;

  async function doSweep() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sweep(connection, note.stealthSeed, new PublicKey(dest));
      setMsg(`swept ${sol(r.lamports)} SOL · ${shortKey(r.signature, 8, 8)}`);
      setOpen(false);
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border hairline">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="pixel-light text-[11px]">{sol(note.lamports)} SOL</span>
        <span className="text-fine text-ink-60">
          in{' '}
          <a className="lnk" href={explorerAddress(wallet.toBase58(), network, rpcUrl)} target="_blank" rel="noreferrer">
            {shortKey(wallet.toBase58(), 6, 6)}
          </a>
        </span>
        <span className="text-fine">
          {balance == null ? 'balance unknown' : swept ? 'swept' : `${sol(balance)} SOL sitting there`}
        </span>
        <span className="ml-auto flex gap-2">
          {!swept && (
            <Button sm onClick={() => setOpen((o) => !o)}>
              {open ? 'Cancel' : 'Sweep'}
            </Button>
          )}
          <Button ghost sm onClick={() => setShowKey((k) => !k)}>
            {showKey ? 'Hide key' : 'Show key'}
          </Button>
        </span>
      </div>
      {open && (
        <div className="border-t hairline px-4 py-3">
          <p className="mb-2 text-fine text-ink-60">
            Move it to a wallet. Sweeping to your main wallet links this address to you from that moment on; a fresh wallet keeps the chain guessing.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="field flex-1 min-w-[260px]"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="destination wallet address"
              spellCheck={false}
            />
            <Button onClick={() => void doSweep()} disabled={!destOk || busy}>
              {busy ? 'Sweeping…' : 'Sweep all'}
            </Button>
          </div>
        </div>
      )}
      {showKey && (
        <div className="border-t border-dashed hairline px-4 py-3">
          <p className="mb-2 text-fine text-ink-60">
            Private key of the one-time wallet. Import it into Phantom to spend from it directly, without sweeping.
          </p>
          <p className="break-all text-fine">{exportStealthKey(note.stealthSeed)}</p>
        </div>
      )}
      {msg && <p className="border-t hairline px-4 py-2 text-fine">{msg}</p>}
    </div>
  );
}

function Item({d, n}: {d: RawDrop; n: Note}) {
  const {readSet, markRead, network, rpcUrl, lastScan} = useApp();
  const unread = !readSet.has(d.signature);
  const from = n.sender ? encodeAddress(n.sender) : null;
  const paid = n.lamports > 0n;
  return (
    <li
      className="border-b hairline py-6 first:border-t"
      onMouseEnter={() => unread && markRead(d.signature)}
      onFocus={() => unread && markRead(d.signature)}
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-fine text-ink-60">
        {unread && <span className="pixel-light bg-ink px-1.5 py-0.5 text-[9px] text-page">NEW</span>}
        <span className="tabular-nums">{utc(d.time, true)} UTC</span>
        <span>{ago(d.time)}</span>
        <span>{paid ? 'payment' : 'note'}</span>
        <span>{n.bucket} B bucket</span>
        <a className="lnk ml-auto" href={explorerTx(d.signature, network, rpcUrl)} target="_blank" rel="noreferrer">
          tx
        </a>
      </div>
      <p className="mb-3 text-fine">
        <span className="text-ink-60">from </span>
        {from ? (
          <>
            <span className="break-all">{from}</span>
            <span className="ml-2 text-ink-60">· signature verified</span>
          </>
        ) : n.senderForged ? (
          <span>anonymous · a sender claim was present but its signature failed, so it was discarded</span>
        ) : (
          <span>anonymous</span>
        )}
      </p>
      {n.body && <p className="max-w-[72ch] whitespace-pre-wrap break-words text-body">{n.body}</p>}
      {paid && <Payment note={n} tick={lastScan ?? 0} />}
      {from && (
        <div className="mt-4 flex gap-3">
          <a href={href('/drop', {to: from})} className="btn btn-ghost btn-sm">
            Reply
          </a>
          <Copy text={from} label="Copy sender" />
        </div>
      )}
    </li>
  );
}

export function Inbox() {
  const {drops, notes, identity, windowDays, scanning} = useApp();
  const mine = drops.filter((d) => notes.has(d.signature));
  const me = identity ? encodeAddress(identity.public) : null;
  const received = mine.reduce((acc, d) => acc + notes.get(d.signature)!.lamports, 0n);

  return (
    <>
      <PageTitle
        kicker={me ? `for ${me.slice(0, 8)}… · last ${windowDays} days` : 'nothing to open with'}
        title="Inbox"
        aside={scanning ? 'scanning…' : `${mine.length} opened${received > 0n ? ` · ${sol(received)} SOL received` : ''}`}
      />

      {!identity ? (
        <Notice>
          An inbox is just the board read with a key.{' '}
          <a className="lnk underline" href="#/me">
            Make a Whisper ID
          </a>{' '}
          and anything sealed to it, notes or SOL, will show up here.
        </Notice>
      ) : mine.length === 0 ? (
        <div className="dither border hairline p-[clamp(24px,5vh,56px)] text-center">
          <p className="pixel mb-3 text-[clamp(16px,1.6vw,22px)]">Nothing yet</p>
          <p className="mx-auto max-w-[46ch] text-body text-ink-60">
            No drop in the last {windowDays} days opens with your key. Share your address; the board rescans itself every minute.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Copy text={me!} label="Copy my address" sm={false} />
            <a href="#/board" className="btn btn-ghost">
              Watch the board
            </a>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {mine.map((d) => (
            <Item key={d.signature} d={d} n={notes.get(d.signature)!} />
          ))}
        </ul>
      )}
    </>
  );
}
