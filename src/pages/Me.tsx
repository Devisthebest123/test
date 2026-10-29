import {LAMPORTS_PER_SOL, PublicKey} from '@solana/web3.js';
import {useEffect, useState} from 'react';
import {Button, Copy, Field, Notice, PageTitle, Rule, Specs} from '../components/ui';
import {href} from '../hooks/useHashRoute';
import {NETWORKS, RPC_DEFAULTS, airdrop, explorerAddress} from '../lib/board';
import {burnerIdentity, exportSecret, importSecret, shortKey} from '../lib/identity';
import {encodeAddress} from '../lib/protocol';
import {useApp} from '../state/AppContext';

function useBalance(pubkey: string | null, tick: number) {
  const {connection} = useApp();
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    if (!pubkey) return setBal(null);
    let live = true;
    connection
      .getBalance(new PublicKey(pubkey))
      .then((b) => live && setBal(b))
      .catch(() => live && setBal(null));
    return () => {
      live = false;
    };
  }, [pubkey, connection, tick]);
  return bal;
}

const sol = (lamports: number | null) => (lamports == null ? '…' : `${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

function IdentitySection() {
  const {identity, identitySource, remember, setRemember, setIdentity, forgetIdentity, deriveFromWallet, wallet, burner, createBurner} =
    useApp();
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [secretIn, setSecretIn] = useState('');
  const [reveal, setReveal] = useState(false);

  if (identity) {
    const addr = encodeAddress(identity.public);
    const share = `${location.origin}${location.pathname}${href('/drop', {to: addr})}`;
    return (
      <section>
        <Rule label="Your Whisper ID" right={`from ${identitySource}`} />
        <p className="mt-5 break-all border hairline p-4 text-[clamp(14px,1.4vw,18px)] leading-[1.4]">{addr}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Copy text={addr} label="Copy address" />
          <Copy text={share} label="Copy send link" />
          <Button ghost sm onClick={() => setReveal((r) => !r)}>
            {reveal ? 'Hide secret' : 'Show secret'}
          </Button>
          <Button ghost sm onClick={forgetIdentity}>
            Forget on this device
          </Button>
        </div>
        {reveal && (
          <div className="mt-3 border border-dashed hairline p-4">
            <p className="mb-2 text-fine text-ink-60">
              Anyone holding this can read every drop ever sealed to you. Paste it under Import on another device.
            </p>
            <p className="break-all text-body">{exportSecret(identity)}</p>
          </div>
        )}
        <label className="mt-5 flex items-center gap-3 text-body">
          <input
            type="checkbox"
            className="h-4 w-4 appearance-none border hairline checked:bg-ink"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember this identity in this browser (otherwise it is gone when the tab closes)
        </label>
        <p className="mt-4 max-w-[64ch] text-body text-ink-60">
          This is not a wallet address and cannot hold funds. Give it to anyone who should be able to reach you; notes and SOL sealed to it appear in your inbox after the next scan.
        </p>
      </section>
    );
  }

  return (
    <section>
      <Rule label="Your Whisper ID" right="none yet" />
      <p className="mt-5 max-w-[64ch] text-body text-ink-60">
        A Whisper ID is how people reach you. It is not a wallet address and never holds funds. Connect your wallet and sign once; the same wallet always gives the same ID.
      </p>
      {err && (
        <div className="mt-4">
          <Notice kind="error">{err}</Notice>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-4 border hairline p-5">
        <p className="pixel-light text-[11px]">From your wallet</p>
        {wallet.publicKey ? (
          <>
            <p className="text-body text-ink-60">
              Connected: {wallet.wallet?.adapter.name} {shortKey(wallet.publicKey.toBase58(), 6, 6)}. One signature derives your ID. It costs nothing and moves nothing.
            </p>
            <div>
              <Button
                onClick={() => {
                  setErr(null);
                  deriveFromWallet().catch((e) => setErr(e.message));
                }}
              >
                Sign with {wallet.wallet?.adapter.name ?? 'wallet'}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-body text-ink-60">Connect a wallet under “Who pays the fee” below, then come back here and sign.</p>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-fine text-ink-60 lnk">Advanced: no wallet, or moving an ID between devices</summary>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3 border hairline p-5">
            <p className="pixel-light text-[11px]">Throwaway (burner)</p>
            <p className="flex-1 text-body text-ink-60">
              A keypair kept only in this browser pays fees and backs an ID. Nothing ties it to you. Gone if you clear the browser.
            </p>
            <Button
              ghost
              onClick={() => {
                const kp = burner ?? createBurner();
                setIdentity(burnerIdentity(kp), 'burner');
              }}
            >
              {burner ? 'Use the existing burner' : 'Make a burner'}
            </Button>
          </div>
          <div className="flex flex-col gap-3 border hairline p-5">
            <p className="pixel-light text-[11px]">Import</p>
            <p className="flex-1 text-body text-ink-60">Paste a secret exported from another device.</p>
            {importing ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    setIdentity(importSecret(secretIn), 'imported');
                    setSecretIn('');
                  } catch (ex) {
                    setErr((ex as Error).message);
                  }
                }}
              >
                <input className="field" value={secretIn} onChange={(e) => setSecretIn(e.target.value)} placeholder="base58 secret" spellCheck={false} />
                <Button type="submit" ghost sm>
                  Import
                </Button>
              </form>
            ) : (
              <Button ghost onClick={() => setImporting(true)}>
                Paste a secret
              </Button>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}

function PaySection() {
  const {wallet, burner, createBurner, deleteBurner, payWith, setPayWith, network, connection, rpcUrl} = useApp();
  const [tick, setTick] = useState(0);
  const walletBal = useBalance(wallet.publicKey?.toBase58() ?? null, tick);
  const burnerBal = useBalance(burner?.publicKey.toBase58() ?? null, tick);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const detected = wallet.wallets.filter((w) => w.readyState === 'Installed' || w.readyState === 'Loadable');

  const tap = async (to: PublicKey) => {
    setDropping(true);
    setFaucetMsg(null);
    try {
      await airdrop(connection, to, 1);
      setFaucetMsg('1 SOL landed.');
      setTick((t) => t + 1);
    } catch (e) {
      setFaucetMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDropping(false);
    }
  };

  return (
    <section>
      <Rule label="Who pays the fee" right={`paying with ${payWith}`} />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4 border hairline p-5">
          <div className="flex items-center justify-between">
            <p className="pixel-light text-[11px]">Wallet</p>
            <button type="button" className={`text-fine lnk ${payWith === 'wallet' ? 'underline' : 'text-ink-60'}`} onClick={() => setPayWith('wallet')}>
              {payWith === 'wallet' ? 'selected' : 'select'}
            </button>
          </div>
          {wallet.publicKey ? (
            <>
              <Specs
                rows={[
                  ['wallet', wallet.wallet?.adapter.name ?? ''],
                  ['address', shortKey(wallet.publicKey.toBase58(), 6, 6)],
                  ['balance', sol(walletBal)],
                ]}
              />
              <div className="flex flex-wrap gap-2">
                {network !== 'mainnet-beta' && (
                  <Button sm onClick={() => void tap(wallet.publicKey!)} disabled={dropping}>
                    {dropping ? 'Asking…' : 'Airdrop 1 SOL'}
                  </Button>
                )}
                <Button ghost sm onClick={() => void wallet.disconnect()}>
                  Disconnect
                </Button>
                <Button ghost sm onClick={() => setTick((t) => t + 1)}>
                  Refresh
                </Button>
              </div>
            </>
          ) : detected.length === 0 ? (
            <p className="text-body text-ink-60">
              No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, or use a burner.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {detected.map((w) => (
                <button
                  key={w.adapter.name}
                  type="button"
                  className="flex items-center gap-3 border hairline px-3 py-2 text-left text-body hover:bg-ink hover:text-page"
                  onClick={() => {
                    wallet.select(w.adapter.name);
                  }}
                >
                  <img src={w.adapter.icon} alt="" className="h-5 w-5 grayscale" />
                  {w.adapter.name}
                  {wallet.connecting && wallet.wallet?.adapter.name === w.adapter.name && <span className="ml-auto text-fine">connecting…</span>}
                </button>
              ))}
              {wallet.wallet && !wallet.connected && !wallet.connecting && (
                <Button sm onClick={() => wallet.connect().catch(() => {})}>
                  Connect {wallet.wallet.adapter.name}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 border hairline p-5">
          <div className="flex items-center justify-between">
            <p className="pixel-light text-[11px]">Burner</p>
            {burner && (
              <button type="button" className={`text-fine lnk ${payWith === 'burner' ? 'underline' : 'text-ink-60'}`} onClick={() => setPayWith('burner')}>
                {payWith === 'burner' ? 'selected' : 'select'}
              </button>
            )}
          </div>
          {burner ? (
            <>
              <Specs
                rows={[
                  [
                    'address',
                    <a className="lnk" href={explorerAddress(burner.publicKey.toBase58(), network, rpcUrl)} target="_blank" rel="noreferrer">
                      {shortKey(burner.publicKey.toBase58(), 6, 6)}
                    </a>,
                  ],
                  ['balance', sol(burnerBal)],
                ]}
              />
              <p className="text-fine text-ink-60">
                {network === 'mainnet-beta'
                  ? 'Send it a little SOL from somewhere that is not linked to you. A drop costs 5,000 lamports.'
                  : 'Test cluster: use Airdrop, or send it test SOL.'}
              </p>
              {faucetMsg && <p className="text-fine">{faucetMsg}</p>}
              <div className="flex flex-wrap gap-2">
                {network !== 'mainnet-beta' && (
                  <Button sm onClick={() => void tap(burner.publicKey)} disabled={dropping}>
                    {dropping ? 'Asking…' : 'Airdrop 1 SOL'}
                  </Button>
                )}
                <Copy text={burner.publicKey.toBase58()} label="Copy address" />
                <Button ghost sm onClick={() => setTick((t) => t + 1)}>
                  Refresh
                </Button>
                {confirmDelete ? (
                  <>
                    <Button
                      sm
                      onClick={() => {
                        deleteBurner();
                        setConfirmDelete(false);
                      }}
                    >
                      Yes, delete it
                    </Button>
                    <Button ghost sm onClick={() => setConfirmDelete(false)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button ghost sm onClick={() => setConfirmDelete(true)}>
                    Delete burner
                  </Button>
                )}
              </div>
              {confirmDelete && (
                <p className="text-fine">Any SOL left in it is gone, and so is any identity derived from it.</p>
              )}
            </>
          ) : (
            <>
              <p className="flex-1 text-body text-ink-60">
                A keypair that lives in this browser's storage. Nothing ties it to you except how you fund it.
              </p>
              <Button ghost onClick={() => createBurner()}>
                Make a burner
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function NetworkSection() {
  const {network, setNetwork, rpcUrl, setRpcUrl, boardName, setBoardName, board} = useApp();
  const [rpc, setRpc] = useState(rpcUrl);
  const [name, setName] = useState(boardName);
  useEffect(() => setRpc(rpcUrl), [rpcUrl]);
  useEffect(() => setName(boardName), [boardName]);

  return (
    <section>
      <Rule label="Network" right={board.toBase58()} />
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Field label="Cluster">
          <div className="flex border hairline">
            {NETWORKS.map((n) => (
              <button
                key={n}
                type="button"
                className={`flex-1 px-3 py-2.5 text-fine ${network === n ? 'bg-ink text-page' : 'hover:bg-ink-08'}`}
                onClick={() => setNetwork(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Field label="RPC endpoint" hint="blur to save">
          <input
            className="field"
            value={rpc}
            onChange={(e) => setRpc(e.target.value)}
            onBlur={() => setRpcUrl(rpc)}
            placeholder={RPC_DEFAULTS[network]}
            spellCheck={false}
          />
        </Field>
        <Field label="Board" hint="a name, up to 32 bytes">
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setBoardName(name)}
            placeholder="public"
            spellCheck={false}
          />
        </Field>
      </div>
      <p className="mt-4 max-w-[70ch] text-body text-ink-60">
        {network === 'mainnet-beta'
          ? 'Mainnet costs real SOL and the public RPC node is strict with browsers. Put your own endpoint above.'
          : network === 'localnet'
            ? 'A validator on this machine (solana-test-validator). Instant, free, and gone when you reset it.'
            : 'Devnet SOL is free and worthless; this is the place to try things.'}{' '}
        A board is just a name hashed into an address. Agree on a private one with your contacts if you want a quieter room.
      </p>
    </section>
  );
}

export function Me() {
  return (
    <>
      <PageTitle kicker="identity, fees, network" title="Identity" />
      <div className="flex flex-col gap-[clamp(40px,7vh,80px)]">
        <IdentitySection />
        <PaySection />
        <NetworkSection />
      </div>
    </>
  );
}
