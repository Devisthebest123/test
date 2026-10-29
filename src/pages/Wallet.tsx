import {Copy, Notice, PageTitle, Rule} from '../components/ui';
import {OFFICIAL_WALLET, explorerAddress} from '../lib/board';
import {useApp} from '../state/AppContext';

/** The one public wallet of the project: the address the coin launches from. */
export function Wallet() {
  const {network, rpcUrl} = useApp();
  return (
    <>
      <PageTitle kicker="the official whisper wallet" title="Wallet" aside="one address, public, that is all" />

      <Rule label="Official wallet" right={OFFICIAL_WALLET ? 'live' : 'not announced yet'} />

      {OFFICIAL_WALLET ? (
        <>
          <p className="mt-5 break-all border hairline p-5 text-[clamp(16px,1.6vw,22px)] leading-[1.4]">{OFFICIAL_WALLET}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Copy text={OFFICIAL_WALLET} label="Copy address" />
            <a className="btn btn-ghost btn-sm" href={explorerAddress(OFFICIAL_WALLET, network, rpcUrl)} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          </div>
        </>
      ) : (
        <div className="dither mt-5 border hairline p-[clamp(24px,5vh,56px)] text-center">
          <p className="pixel mb-3 text-[clamp(16px,1.6vw,22px)]">Not announced yet</p>
          <p className="mx-auto max-w-[46ch] text-body text-ink-60">
            The official wallet will appear here, and only here, when it goes live.
          </p>
        </div>
      )}

      <div className="mt-8">
        <Notice>
          This page is the only place the official wallet is published. Any other address claiming to be Whisper is not ours.
        </Notice>
      </div>

      <p className="mt-8 max-w-[64ch] text-body text-ink-60">
        Your own wallet is separate. You connect it to pay the network fee when you send a drop, and it never has to hold anything but a little SOL.
      </p>
    </>
  );
}
