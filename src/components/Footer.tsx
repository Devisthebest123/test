import {explorerAddress} from '../lib/board';
import {shortKey} from '../lib/identity';
import {useApp} from '../state/AppContext';

export function Footer() {
  const {board, boardName, network, rpcUrl} = useApp();
  const addr = board.toBase58();
  return (
    <footer className="mt-auto border-t hairline px-[clamp(20px,2.6vw,40px)] py-6 text-fine text-ink-60">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
        <p>
          Whisper v0.1 · board “{boardName}” ·{' '}
          <a className="lnk" href={explorerAddress(addr, network, rpcUrl)} target="_blank" rel="noreferrer">
            {shortKey(addr, 6, 6)}
          </a>{' '}
          · {network}
        </p>
        <p>memo · x25519 · hkdf-sha256 · xchacha20-poly1305 · nothing else</p>
      </div>
    </footer>
  );
}
