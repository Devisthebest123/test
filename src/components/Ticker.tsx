import {explorerAddress} from '../lib/board';
import {shortKey} from '../lib/identity';
import {useApp} from '../state/AppContext';
import {ago} from './ui';

/** One line of truth about the board, shown under the header on every page. */
export function Ticker() {
  const {drops, notes, scanning, lastScan, network, rpcUrl, board, boardName, windowDays, identity} = useApp();
  const latest = drops[0]?.time ?? null;
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const today = drops.filter((d) => (d.time ?? 0) >= dayAgo).length;
  return (
    <div className="border-y hairline">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-1 px-[clamp(20px,2.6vw,40px)] py-2.5 text-fine">
        <span className="pixel-light text-[10px] tracking-[0.08em]">
          {scanning ? 'SCANNING' : 'ON AIR'}
          <span className={scanning ? 'cursor' : ''} />
        </span>
        <span>
          board{' '}
          <a className="lnk" href={explorerAddress(board.toBase58(), network, rpcUrl)} target="_blank" rel="noreferrer">
            “{boardName}”
          </a>{' '}
          · {network} · {shortKey(board.toBase58(), 4, 4)}
        </span>
        <span>
          {drops.length} drops / {windowDays}d · {today} today · last {latest ? ago(latest) : 'never'}
        </span>
        {identity && <span>{notes.size} for you</span>}
        <span className="ml-auto text-ink-60">{lastScan ? `scanned ${ago(lastScan)}` : 'not scanned yet'}</span>
      </div>
    </div>
  );
}
