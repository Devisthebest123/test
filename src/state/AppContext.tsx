import {useConnection, useWallet, type WalletContextState} from '@solana/wallet-adapter-react';
import {Keypair, type Connection, type PublicKey, type Transaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_BOARD,
  DEFAULT_NETWORK,
  NETWORK_PINNED,
  RPC_DEFAULTS,
  boardAddress,
  scanBoard,
  type DropSigner,
  type Network,
  type RawDrop,
} from '../lib/board';
import {
  burnerSigner,
  clearBurner,
  loadBurner,
  saveBurner,
  shortKey,
  type IdentitySource,
} from '../lib/identity';
import {
  IDENTITY_MESSAGE,
  fromMemo,
  identityFromSecret,
  identityFromSignature,
  open,
  type Identity,
  type Note,
} from '../lib/protocol';
import {drop, load, save, session} from '../lib/store';

// ------------------------------------------------------------------ settings

type Settings = {
  network: Network;
  setNetwork: (n: Network) => void;
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  boardName: string;
  setBoardName: (name: string) => void;
};

const SettingsCtx = createContext<Settings | null>(null);

export function SettingsProvider({children}: {children: ReactNode}) {
  const [network, setNetworkState] = useState<Network>(() => (NETWORK_PINNED ? DEFAULT_NETWORK : load<Network>('network', DEFAULT_NETWORK)));
  const [rpcs, setRpcs] = useState<Record<Network, string>>(() => ({...RPC_DEFAULTS, ...load('rpc', {})}));
  const [boardName, setBoardNameState] = useState(() => load('board', DEFAULT_BOARD));

  const value = useMemo<Settings>(
    () => ({
      network,
      setNetwork: (n) => {
        setNetworkState(n);
        save('network', n);
      },
      rpcUrl: rpcs[network],
      setRpcUrl: (url) => {
        const next = {...rpcs, [network]: url.trim() || RPC_DEFAULTS[network]};
        setRpcs(next);
        save('rpc', next);
      },
      boardName,
      setBoardName: (name) => {
        const clean = name.trim() || DEFAULT_BOARD;
        setBoardNameState(clean);
        save('board', clean);
      },
    }),
    [network, rpcs, boardName],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const v = useContext(SettingsCtx);
  if (!v) throw new Error('useSettings outside SettingsProvider');
  return v;
}

// ----------------------------------------------------------------------- app

type PayWith = 'wallet' | 'burner';

type StoredIdentity = {secret: string; source: IdentitySource};

type AppState = Settings & {
  board: PublicKey;
  connection: Connection;
  wallet: WalletContextState;

  identity: Identity | null;
  identitySource: IdentitySource | null;
  remember: boolean;
  setRemember: (v: boolean) => void;
  setIdentity: (id: Identity, source: IdentitySource) => void;
  forgetIdentity: () => void;
  deriveFromWallet: () => Promise<void>;

  burner: Keypair | null;
  createBurner: () => Keypair;
  deleteBurner: () => void;

  payWith: PayWith;
  setPayWith: (p: PayWith) => void;
  signer: DropSigner | null;
  signerLabel: string | null;

  drops: RawDrop[];
  notes: Map<string, Note>;
  scanning: boolean;
  scanError: string | null;
  scanProgress: {walked: number; found: number} | null;
  lastScan: number | null;
  scan: () => Promise<void>;
  windowDays: number;
  setWindowDays: (d: number) => void;

  readSet: Set<string>;
  markRead: (sig: string) => void;
  inboxUnread: number;
};

const AppCtx = createContext<AppState | null>(null);

const CACHE_CAP = 1500;
const AUTO_SCAN_MS = 60_000;

type CachedDrop = Omit<RawDrop, 'envelope'>;

function readIdentity(): {id: Identity; source: IdentitySource; remembered: boolean} | null {
  const local = load<StoredIdentity | null>('identity', null);
  const sess = session() ? load<StoredIdentity | null>('identity', null, session()!) : null;
  const stored = local ?? sess;
  if (!stored) return null;
  try {
    return {id: identityFromSecret(bs58.decode(stored.secret)), source: stored.source, remembered: !!local};
  } catch {
    return null;
  }
}

export function AppProvider({children}: {children: ReactNode}) {
  const settings = useSettings();
  const {connection} = useConnection();
  const wallet = useWallet();
  const board = useMemo(() => boardAddress(settings.boardName), [settings.boardName]);

  // ---- identity
  const [idState, setIdState] = useState(() => readIdentity());
  const identity = idState?.id ?? null;
  const identitySource = idState?.source ?? null;
  const remember = idState?.remembered ?? false;

  const persistIdentity = useCallback((id: Identity, source: IdentitySource, rememberIt: boolean) => {
    const payload: StoredIdentity = {secret: bs58.encode(id.secret), source};
    if (rememberIt) {
      save('identity', payload);
      if (session()) drop('identity', session()!);
    } else {
      drop('identity');
      if (session()) save('identity', payload, session()!);
    }
    setIdState({id, source, remembered: rememberIt});
  }, []);

  // A burner already lives in local storage, so an identity derived from it
  // is remembered too; anything else stays session-only until asked.
  const setIdentity = useCallback(
    (id: Identity, source: IdentitySource) => persistIdentity(id, source, source === 'burner' ? true : remember),
    [persistIdentity, remember],
  );
  const setRemember = useCallback(
    (v: boolean) => {
      if (identity && identitySource) persistIdentity(identity, identitySource, v);
    },
    [identity, identitySource, persistIdentity],
  );
  const forgetIdentity = useCallback(() => {
    drop('identity');
    if (session()) drop('identity', session()!);
    setIdState(null);
  }, []);

  const deriveFromWallet = useCallback(async () => {
    if (!wallet.publicKey) throw new Error('connect a wallet first');
    if (!wallet.signMessage) throw new Error('this wallet cannot sign messages');
    const sig = await wallet.signMessage(new TextEncoder().encode(IDENTITY_MESSAGE));
    setIdentity(identityFromSignature(sig), 'wallet');
  }, [wallet, setIdentity]);

  // ---- burner
  const [burner, setBurner] = useState<Keypair | null>(() => loadBurner());
  const createBurner = useCallback(() => {
    const kp = Keypair.generate();
    saveBurner(kp);
    setBurner(kp);
    return kp;
  }, []);
  const deleteBurner = useCallback(() => {
    clearBurner();
    setBurner(null);
    if (identitySource === 'burner') forgetIdentity();
  }, [identitySource, forgetIdentity]);

  // ---- who pays
  const [payWith, setPayWithState] = useState<PayWith>(() => load<PayWith>('payWith', 'wallet'));
  const setPayWith = useCallback((p: PayWith) => {
    setPayWithState(p);
    save('payWith', p);
  }, []);
  const walletReady = !!wallet.publicKey && !!wallet.signTransaction;
  const effectivePay: PayWith = payWith === 'wallet' && !walletReady && burner ? 'burner' : payWith;
  const signer = useMemo<DropSigner | null>(() => {
    if (effectivePay === 'wallet' && walletReady) {
      return {
        publicKey: wallet.publicKey!,
        signTransaction: (tx: Transaction) => wallet.signTransaction!(tx),
      };
    }
    if (effectivePay === 'burner' && burner) return burnerSigner(burner);
    return null;
  }, [effectivePay, walletReady, wallet, burner]);
  const signerLabel = signer
    ? effectivePay === 'wallet'
      ? `${wallet.wallet?.adapter.name ?? 'wallet'} ${shortKey(signer.publicKey.toBase58())}`
      : `burner ${shortKey(signer.publicKey.toBase58())}`
    : null;

  // ---- the board
  const cacheKey = `cache.${settings.network}.${settings.boardName}`;
  const [drops, setDrops] = useState<RawDrop[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{walked: number; found: number} | null>(null);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [windowDays, setWindowDaysState] = useState(() => load('window', 7));
  const setWindowDays = useCallback((d: number) => {
    setWindowDaysState(d);
    save('window', d);
  }, []);

  useEffect(() => {
    const cached = load<CachedDrop[]>(cacheKey, []);
    const restored: RawDrop[] = [];
    for (const c of cached) {
      const envelope = fromMemo(c.memo);
      if (envelope) restored.push({...c, envelope});
    }
    setDrops(restored);
    setLastScan(null);
    setScanError(null);
  }, [cacheKey]);

  const dropsRef = useRef(drops);
  dropsRef.current = drops;
  const busy = useRef(false);

  const scan = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setScanning(true);
    setScanError(null);
    setScanProgress(null);
    try {
      const since = Math.floor(Date.now() / 1000) - windowDays * 86400;
      const known = new Set(dropsRef.current.map((d) => d.signature));
      const fresh = await scanBoard(connection, board, {
        since,
        max: 2000,
        known,
        onProgress: (walked, found) => setScanProgress({walked, found}),
      });
      const merged = new Map<string, RawDrop>();
      for (const d of dropsRef.current) merged.set(d.signature, d);
      for (const d of fresh) merged.set(d.signature, d);
      const next = [...merged.values()]
        .filter((d) => d.time == null || d.time >= since)
        .sort((a, b) => b.slot - a.slot)
        .slice(0, CACHE_CAP);
      setDrops(next);
      save(
        cacheKey,
        next.map(({envelope: _e, ...rest}) => rest),
      );
      setLastScan(Math.floor(Date.now() / 1000));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      setScanning(false);
    }
  }, [connection, board, windowDays, cacheKey]);

  // First scan, and a quiet one every minute while the tab is visible.
  useEffect(() => {
    void scan();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void scan();
    }, AUTO_SCAN_MS);
    return () => clearInterval(t);
  }, [scan]);

  // ---- what is for me
  const notes = useMemo(() => {
    const m = new Map<string, Note>();
    if (!identity) return m;
    for (const d of drops) {
      const n = open(identity, d.envelope);
      if (n) m.set(d.signature, n);
    }
    return m;
  }, [drops, identity]);

  const [readSet, setReadSet] = useState<Set<string>>(() => new Set(load<string[]>('read', [])));
  const markRead = useCallback((sig: string) => {
    setReadSet((prev) => {
      if (prev.has(sig)) return prev;
      const next = new Set(prev);
      next.add(sig);
      save('read', [...next].slice(-2000));
      return next;
    });
  }, []);
  let inboxUnread = 0;
  for (const sig of notes.keys()) if (!readSet.has(sig)) inboxUnread++;

  const value: AppState = {
    ...settings,
    board,
    connection,
    wallet,
    identity,
    identitySource,
    remember,
    setRemember,
    setIdentity,
    forgetIdentity,
    deriveFromWallet,
    burner,
    createBurner,
    deleteBurner,
    payWith: effectivePay,
    setPayWith,
    signer,
    signerLabel,
    drops,
    notes,
    scanning,
    scanError,
    scanProgress,
    lastScan,
    scan,
    windowDays,
    setWindowDays,
    readSet,
    markRead,
    inboxUnread,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
