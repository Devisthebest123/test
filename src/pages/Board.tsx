import {useState} from 'react';
import {Button, Notice, PageTitle, Status, ago, utc} from '../components/ui';
import {explorerAddress, explorerTx, type RawDrop} from '../lib/board';
import {shortKey} from '../lib/identity';
import {AEAD_OVERHEAD, encodeAddress, hex} from '../lib/protocol';
import {sol, stealthKeypair} from '../lib/stealth';
import {useApp} from '../state/AppContext';
import {href} from '../hooks/useHashRoute';

const WINDOWS = [1, 7, 30];

function Row({d, mine, expanded, onToggle}: {d: RawDrop; mine: boolean; expanded: boolean; onToggle: () => void}) {
  const {notes, network, rpcUrl, markRead} = useApp();
  const note = notes.get(d.signature);
  const size = d.envelope.ciphertext.length - AEAD_OVERHEAD;
  const today = d.time != null && new Date(d.time * 1000).toDateString() === new Date().toDateString();
  return (
    <>
      <tr
        className={`cursor-pointer border-b border-ink-15 ${mine ? 'row-hit' : 'hover:bg-ink-08'}`}
        onClick={() => {
          onToggle();
          if (mine) markRead(d.signature);
        }}
      >
        <td className="py-2 pr-4 whitespace-nowrap tabular-nums">{utc(d.time, !today)}</td>
        <td className="py-2 pr-4 font-medium tracking-wide">{hex(d.envelope.tag)}</td>
        <td className="py-2 pr-4 text-right tabular-nums">{size}</td>
        <td className="py-2 pr-4 hidden sm:table-cell">{shortKey(d.payer, 4, 4)}</td>
        <td className="py-2 text-right whitespace-nowrap">
          {mine ? (note && note.lamports > 0n ? `FOR YOU · ${sol(note.lamports)} SOL` : 'FOR YOU') : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b hairline">
          <td colSpan={5} className="py-4 pr-2">
            {note ? (
              <div className="mb-4 border hairline p-4">
                <p className="mb-2 text-fine text-ink-60">
                  from {note.sender ? `${encodeAddress(note.sender)} (verified)` : note.senderForged ? 'anonymous (forged sender claim discarded)' : 'anonymous'} · {note.bucket}-byte bucket
                  {note.lamports > 0n
                    ? ` · ${sol(note.lamports)} SOL in ${shortKey(stealthKeypair(note.stealthSeed).publicKey.toBase58(), 6, 6)}`
                    : ''}
                </p>
                {note.body && <p className="whitespace-pre-wrap break-words text-body">{note.body}</p>}
                {note.lamports > 0n && (
                  <a href="#/inbox" className="lnk text-fine underline">
                    Sweep it from the inbox
                  </a>
                )}
                {note.sender && (
                  <a href={href('/drop', {to: encodeAddress(note.sender)})} className="btn btn-ghost btn-sm mt-4">
                    Reply
                  </a>
                )}
              </div>
            ) : (
              <p className="mb-3 text-fine text-ink-60">Not addressed to you. All anyone sees:</p>
            )}
            <dl className="grid gap-1 text-fine sm:grid-cols-[auto_1fr] sm:gap-x-6">
              <dt className="text-ink-60">signature</dt>
              <dd className="break-all">
                <a className="lnk" href={explorerTx(d.signature, network, rpcUrl)} target="_blank" rel="noreferrer">
                  {d.signature}
                </a>
              </dd>
              <dt className="text-ink-60">slot</dt>
              <dd>{d.slot}</dd>
              <dt className="text-ink-60">fee payer</dt>
              <dd className="break-all">
                <a className="lnk" href={explorerAddress(d.payer, network, rpcUrl)} target="_blank" rel="noreferrer">
                  {d.payer}
                </a>
              </dd>
              <dt className="text-ink-60">ephemeral key</dt>
              <dd className="break-all">{hex(d.envelope.ephemeral)}</dd>
              <dt className="text-ink-60">memo</dt>
              <dd className="break-all text-ink-60">{d.memo.slice(0, 96)}…</dd>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

export function Board() {
  const {drops, notes, identity, scanning, scanError, scanProgress, lastScan, scan, windowDays, setWindowDays, board, boardName, network, rpcUrl} =
    useApp();
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [openSig, setOpenSig] = useState<string | null>(null);
  const shown = filter === 'mine' ? drops.filter((d) => notes.has(d.signature)) : drops;

  return (
    <>
      <PageTitle
        kicker={`board “${boardName}” · ${network}`}
        title="Board"
        aside={
          <a className="lnk" href={explorerAddress(board.toBase58(), network, rpcUrl)} target="_blank" rel="noreferrer">
            {board.toBase58()}
          </a>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => void scan()} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Scan now'}
        </Button>
        <div className="flex border hairline">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={`px-3 py-2 text-fine ${windowDays === w ? 'bg-ink text-page' : 'hover:bg-ink-08'}`}
              onClick={() => setWindowDays(w)}
            >
              {w}d
            </button>
          ))}
        </div>
        <div className="flex border hairline">
          {(['all', 'mine'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`px-3 py-2 text-fine ${filter === f ? 'bg-ink text-page' : 'hover:bg-ink-08'}`}
              onClick={() => setFilter(f)}
              disabled={f === 'mine' && !identity}
              title={f === 'mine' && !identity ? 'Set up an identity first' : undefined}
            >
              {f === 'all' ? `All ${drops.length}` : `Mine ${notes.size}`}
            </button>
          ))}
        </div>
        <Status live={scanning}>
          {scanning && scanProgress
            ? `walked ${scanProgress.walked} signatures, ${scanProgress.found} drops`
            : scanning
              ? 'reading the board'
              : lastScan
                ? `last scan ${utc(lastScan)} UTC · auto every minute`
                : 'waiting for first scan'}
        </Status>
      </div>

      {scanError && (
        <div className="mb-6">
          <Notice kind="error">
            {scanError}.{' '}
            {network === 'localnet'
              ? 'Is the local validator running?'
              : 'Public RPC nodes rate-limit browsers; set your own endpoint under Identity → Network.'}
          </Notice>
        </div>
      )}

      {!identity && (
        <div className="mb-6">
          <Notice>
            You are reading the board as a stranger. Everything looks like noise until you{' '}
            <a className="lnk underline" href="#/me">
              set up a Whisper ID
            </a>
            .
          </Notice>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="dither border hairline p-[clamp(24px,5vh,56px)] text-center">
          <p className="pixel mb-3 text-[clamp(16px,1.6vw,22px)]">{filter === 'mine' ? 'Nothing for you' : 'Empty board'}</p>
          <p className="mx-auto max-w-[44ch] text-body text-ink-60">
            {filter === 'mine'
              ? `No drop in the last ${windowDays} days opens with your key. Share your address and wait, or widen the window.`
              : `No drops on “${boardName}” in the last ${windowDays} days. Be the first to whisper.`}
          </p>
          <a href="#/drop" className="btn mt-6">
            Leave a drop
          </a>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-fine">
            <thead>
              <tr className="border-b hairline text-left">
                <th className="py-2 pr-4 font-normal text-ink-60">UTC</th>
                <th className="py-2 pr-4 font-normal text-ink-60">tag</th>
                <th className="py-2 pr-4 text-right font-normal text-ink-60">bytes</th>
                <th className="py-2 pr-4 hidden font-normal text-ink-60 sm:table-cell">payer</th>
                <th className="py-2 text-right font-normal text-ink-60">status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <Row
                  key={d.signature}
                  d={d}
                  mine={notes.has(d.signature)}
                  expanded={openSig === d.signature}
                  onToggle={() => setOpenSig((s) => (s === d.signature ? null : d.signature))}
                />
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-fine text-ink-60">
            {shown.length} shown · newest first · latest {ago(drops[0]?.time ?? null)} · click a row to inspect what the chain holds
          </p>
        </div>
      )}
    </>
  );
}
