import {ConnectionProvider, WalletProvider} from '@solana/wallet-adapter-react';
import {useMemo} from 'react';
import {Footer} from './components/Footer';
import {Header} from './components/Header';
import {Ticker} from './components/Ticker';
import {useHashRoute} from './hooks/useHashRoute';
import {Board} from './pages/Board';
import {Drop} from './pages/Drop';
import {Home} from './pages/Home';
import {Inbox} from './pages/Inbox';
import {Me} from './pages/Me';
import {Protocol} from './pages/Protocol';
import {Wallet} from './pages/Wallet';
import {AppProvider, SettingsProvider, useSettings} from './state/AppContext';

function Shell() {
  const route = useHashRoute();
  const page = useMemo(() => {
    switch (route.path) {
      case '/board':
        return <Board />;
      case '/drop':
        return <Drop query={route.query} />;
      case '/inbox':
        return <Inbox />;
      case '/me':
        return <Me />;
      case '/wallet':
        return <Wallet />;
      case '/protocol':
        return <Protocol />;
      default:
        return null;
    }
  }, [route.path, route.query]);

  if (!page) return <Home />;

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-page text-ink">
      <Header current={route.path} />
      <div className="mt-[clamp(16px,3vh,28px)]">
        <Ticker />
      </div>
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-[clamp(20px,2.6vw,40px)] pt-[clamp(32px,6vh,72px)] pb-[clamp(40px,8vh,96px)]">
        {page}
      </main>
      <Footer />
    </div>
  );
}

/** Wallet adapter wants the endpoint from props; settings live in our own store. */
function Providers({children}: {children: React.ReactNode}) {
  const {rpcUrl} = useSettings();
  return (
    <ConnectionProvider endpoint={rpcUrl} config={{commitment: 'confirmed'}}>
      <WalletProvider wallets={[]} autoConnect>
        <AppProvider>{children}</AppProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <Providers>
        <Shell />
      </Providers>
    </SettingsProvider>
  );
}
