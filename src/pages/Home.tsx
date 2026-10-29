import {Footer} from '../components/Footer';
import {Header} from '../components/Header';
import {GLYPHS, Pixel} from '../components/Mark';
import {ScanCat} from '../components/ScanCat';
import {Rule} from '../components/ui';
import {Ticker} from '../components/Ticker';
import {ctas, headline, hides, lede, media, steps} from '../content';
import {useFitText} from '../hooks/useFitText';

const ICONS = [GLYPHS.seal, GLYPHS.pin, GLYPHS.scan];

function Hero() {
  const title = useFitText<HTMLHeadingElement>();
  return (
    <div className="relative flex min-h-[100svh] flex-col overflow-hidden bg-page text-ink">
      <Header current="/" />

      {/* Desktop: the bird owns the right 60%, under the nav. Phone: a square between headline and copy. */}
      <ScanCat video={media.video} poster={media.poster} className="scan-fade order-2 aspect-square w-full md:absolute md:top-[11vh] md:right-0 md:bottom-0 md:aspect-auto md:w-[60%]" />

      <main className="contents md:relative md:z-10 md:flex md:flex-1 md:flex-col md:px-[clamp(20px,2.6vw,40px)] md:pt-[15vh] md:pb-[10vh]">
        <div className="order-1 w-full px-[20px] pt-[9vh] pb-6 md:w-[38%] md:p-0">
          <h1 ref={title} className="pixel inline-block whitespace-nowrap text-hero rise">
            {headline[0]}
            <br />
            {headline[1]}
            <br />
            {headline[2]}
          </h1>
        </div>

        <div className="order-3 px-[20px] pt-6 pb-[8vh] md:mt-auto md:p-0">
          <p className="max-w-[36ch] text-lede rise [animation-delay:120ms]">{lede}</p>
          <div className="mt-[clamp(28px,5vh,52px)] flex items-center gap-[clamp(18px,1.6vw,26px)] rise [animation-delay:220ms]">
            <a href={ctas.primary.href} className="btn">
              {ctas.primary.label}
            </a>
            <a href={ctas.secondary.href} className="group inline-flex items-center gap-2 text-ui">
              {ctas.secondary.label}
              <svg viewBox="0 0 6 10" className="h-[0.8em] w-auto transition-transform group-hover:translate-x-0.5" aria-hidden>
                <path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

function How() {
  return (
    <section id="how" className="mx-auto w-full max-w-[1120px] px-[clamp(20px,2.6vw,40px)] py-[clamp(48px,9vh,112px)]">
      <Rule label="How it works" right="three moves" />
      <div className="mt-[clamp(28px,5vh,56px)] grid gap-[clamp(28px,4vw,56px)] md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <Pixel grid={ICONS[i]} className="h-9 w-9" />
              <span className="pixel-light text-[11px] text-ink-60">{s.n}</span>
            </div>
            <h2 className="pixel text-[clamp(18px,1.6vw,22px)]">{s.title}</h2>
            <p className="max-w-[40ch] text-body text-ink-60">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Hides() {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-[clamp(20px,2.6vw,40px)] pb-[clamp(48px,9vh,112px)]">
      <Rule label="What the chain learns" right="be honest about it" />
      <div className="mt-[clamp(24px,4vh,44px)] grid gap-x-[clamp(28px,4vw,56px)] md:grid-cols-2">
        {hides.map(([k, v]) => (
          <div key={k} className="flex gap-4 border-b border-dotted border-ink-40 py-4">
            <Pixel grid={GLYPHS.eye} className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-body">{k}</p>
              <p className="text-body text-ink-60">{v}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-[clamp(28px,5vh,56px)] flex flex-wrap items-center gap-5">
        <a href="#/me" className="btn">
          Get a Whisper ID
        </a>
        <a href="#/protocol" className="lnk text-ui">
          Read the protocol
        </a>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-page text-ink">
      <Hero />
      <Ticker />
      <How />
      <Hides />
      <Footer />
    </div>
  );
}
