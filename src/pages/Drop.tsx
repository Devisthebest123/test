import {LAMPORTS_PER_SOL} from '@solana/web3.js';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Button, Field, Notice, PageTitle, Rule} from '../components/ui';
import {explorerTx, postDrop} from '../lib/board';
import {shortKey} from '../lib/identity';
import {MAX_BODY, bucketFor, chaff, decodeAddress, encodeAddress, isAddress, seal, toMemo} from '../lib/protocol';
import {MIN_PAYMENT_LAMPORTS, fundInstruction, parseSol, sol, stealthKeypair} from '../lib/stealth';
import {useApp} from '../state/AppContext';

type Line = {t: string; kind?: 'ok' | 'err'};

export function Drop({query}: {query: URLSearchParams}) {
  const {identity, signer, signerLabel, connection, board, network, rpcUrl, scan} = useApp();
  const [to, setTo] = useState(query.get('to') ?? '');
  const [amount, setAmount] = useState('');
  const [body, setBody] = useState('');
  const [signed, setSigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Line[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = query.get('to');
    if (t) setTo(t);
  }, [query]);

  useEffect(() => {
    if (!signer) return setBalance(null);
    let live = true;
    connection
      .getBalance(signer.publicKey)
      .then((b) => live && setBalance(b))
      .catch(() => live && setBalance(null));
    return () => {
      live = false;
    };
  }, [signer, connection, log.length]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({block: 'nearest'});
  }, [log]);

  const bytes = useMemo(() => new TextEncoder().encode(body).length, [body]);
  const over = bytes > MAX_BODY;
  const bucket = over ? null : bucketFor(bytes);
  const toOk = isAddress(to);
  const toSelf = toOk && identity && encodeAddress(identity.public) === to.trim();

  const lamports = amount.trim() === '' ? 0n : parseSol(amount);
  const amountBad = lamports === null || (lamports > 0n && lamports < BigInt(MIN_PAYMENT_LAMPORTS));
  const paying = lamports !== null && lamports > 0n;
  const needed = (paying ? Number(lamports) : 0) + 10_000;
  const short = balance != null && balance < needed;
  const empty = !paying && body.trim() === '';
  const canSend = toOk && !over && !amountBad && !empty && !!signer && !busy && !short;

  const say = (t: string, kind?: Line['kind']) => setLog((l) => [...l, {t, kind}]);

  async function send(kind: 'drop' | 'chaff') {
    if (!signer) return;
    setBusy(true);
    setLog([]);
    try {
      let memo: string;
      const extra = [];
      if (kind === 'chaff') {
        say('sealing chaff to nobody');
        memo = toMemo(chaff());
      } else {
        const recipient = decodeAddress(to);
        const value = paying ? lamports! : 0n;
        const sealed = seal(recipient, body, signed && identity ? identity : null, value);
        say(`sealing to ${shortKey(to.trim(), 6, 6)} · ${bytes} bytes → ${bucket}-byte bucket`);
        say(signed && identity ? 'sender key included so they can reply' : 'anonymous, no sender key');
        if (paying) {
          const stealth = stealthKeypair(sealed.stealthSeed).publicKey.toBase58();
          say(`${sol(value)} SOL → one-time wallet ${shortKey(stealth, 6, 6)} · only they can open it`);
          extra.push(fundInstruction(signer.publicKey, sealed.stealthSeed, value));
        }
        memo = toMemo(sealed.envelope);
      }
      say(`${memo.length} chars of memo · paying from ${signerLabel}`);
      say('pinning to the board, approve in your wallet if asked');
      const sig = await postDrop(connection, signer, board, memo, extra);
      say(`confirmed ${sig}`, 'ok');
      say(
        kind === 'chaff'
          ? 'noise delivered. opens for nobody.'
          : paying
            ? 'done. the chain saw a stranger get paid and some junk hit the board.'
            : 'it is on the board now. nobody but the recipient can tell which one it is.',
        'ok',
      );
      if (kind === 'drop') {
        setBody('');
        setAmount('');
      }
      void scan();
      setLog((l) => [...l, {t: explorerTx(sig, network, rpcUrl)}]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      say(msg.includes('User rejected') ? 'cancelled in wallet' : msg, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle kicker="leave a drop" title="Drop" aside={`board on ${network}`} />

      <div className="grid gap-[clamp(28px,4vw,64px)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className="flex flex-col gap-7"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) void send('drop');
          }}
        >
          <Field label="To" hint={to ? (toOk ? 'valid Whisper ID' : 'not a Whisper ID') : 'a Whisper ID (wsp1…), never a wallet address'}>
            <input
              className="field"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="wsp1…"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!!to && !toOk}
            />
          </Field>
          {toSelf && <Notice>That is your own address. It works, but it only proves the pipe.</Notice>}

          <Field
            label="SOL"
            hint={
              amount.trim() === ''
                ? 'optional · leave empty for a note only'
                : amountBad
                  ? `at least ${MIN_PAYMENT_LAMPORTS / LAMPORTS_PER_SOL} SOL`
                  : `${sol(lamports!)} SOL to a one-time wallet`
            }
          >
            <input
              className="field tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.000"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={amountBad}
            />
          </Field>

          <Field
            label="Note"
            hint={
              <span className={over ? 'text-ink' : ''}>
                {bytes} / {MAX_BODY} bytes{bucket ? ` · pads to ${bucket}` : ' · too long'}
                {paying && body.trim() === '' ? ' · optional with a payment' : ''}
              </span>
            }
          >
            <textarea
              className="field min-h-[180px] resize-y leading-[1.5]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="plain text. it is encrypted before it leaves this tab."
              aria-invalid={over}
            />
          </Field>

          <label className={`flex items-start gap-3 text-body ${identity ? '' : 'opacity-50'}`}>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 appearance-none border hairline checked:bg-ink"
              checked={signed && !!identity}
              disabled={!identity}
              onChange={(e) => setSigned(e.target.checked)}
            />
            <span>
              Include my Whisper ID inside so they can reply.
              {!identity && (
                <>
                  {' '}
                  <a className="lnk underline" href="#/me">
                    You have none yet.
                  </a>
                </>
              )}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={!canSend}>
              {busy ? 'Working…' : paying ? `Send ${sol(lamports!)} SOL` : 'Pin it to the board'}
            </Button>
            <Button ghost onClick={() => void send('chaff')} disabled={!signer || busy} title="Cover traffic">
              Post chaff instead
            </Button>
          </div>
        </form>

        <aside className="flex flex-col gap-6">
          <div>
            <Rule label="Paying" />
            <div className="mt-4 text-body">
              {signer ? (
                <>
                  <p>{signerLabel}</p>
                  <p className="text-ink-60">
                    {balance == null ? 'balance unknown' : `${sol(balance)} SOL`} · fee about 0.000005 SOL
                    {paying ? ` · plus ${sol(lamports!)} to send` : ''}
                  </p>
                  {short && (
                    <p className="mt-2">
                      Not enough.{' '}
                      {network === 'mainnet-beta' ? (
                        'Top up this wallet first.'
                      ) : (
                        <a className="lnk underline" href="#/me">
                          Airdrop under Identity.
                        </a>
                      )}
                    </p>
                  )}
                  <p className="mt-3 text-fine text-ink-60">
                    This wallet is visible on chain as the payer. If that matters, pay from a burner you funded somewhere unlinked to you.
                  </p>
                </>
              ) : (
                <p>
                  Nothing can pay yet.{' '}
                  <a className="lnk underline" href="#/me">
                    Connect a wallet or make a burner.
                  </a>
                </p>
              )}
            </div>
          </div>

          <div>
            <Rule label="How a payment hides" />
            <p className="mt-4 text-body text-ink-60">
              The SOL does not go to their wallet. It goes to a brand-new address derived from a secret only you two share. They find it by scanning the board, and they are the only one who can spend it. The chain sees a stranger get paid.
            </p>
          </div>

          <div>
            <Rule label="Chaff" />
            <p className="mt-4 text-body text-ink-60">
              Chaff is a drop addressed to nobody. It costs the same, looks the same, and opens for no one. Post some at odd hours and your real drops stop standing out.
            </p>
          </div>

          <div>
            <Rule label="Log" />
            <div className="mt-4 min-h-[120px] border hairline bg-page p-3 text-fine leading-[1.6]">
              {log.length === 0 ? (
                <p className="text-ink-60">
                  idle<span className="cursor" />
                </p>
              ) : (
                log.map((l, i) => (
                  <p key={i} className={`break-all ${l.kind === 'err' ? 'underline decoration-dashed' : ''}`}>
                    <span className="text-ink-60">{'> '}</span>
                    {l.t.startsWith('http') ? (
                      <a className="lnk underline" href={l.t} target="_blank" rel="noreferrer">
                        open in explorer
                      </a>
                    ) : (
                      l.t
                    )}
                  </p>
                ))
              )}
              <div ref={logEnd} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
