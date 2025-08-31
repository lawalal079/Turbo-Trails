import { PrivyProvider } from '@privy-io/react-auth';
import Head from 'next/head';
import '../styles/globals.css';

// Define Monad testnet chain
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  testnet: true,
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    public: { http: ['https://testnet-rpc.monad.xyz'] },
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet-explorer.monad.xyz' },
  },
};

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Turbo-trails</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b1220" />
        {/* Favicon: prefer provided PNG; fallback to .ico if present */}
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </Head>
      <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}
      config={{
        loginMethodsAndOrder: {
          primary: [
            `privy:${process.env.NEXT_PUBLIC_MONAD_GAMES_CROSS_APP_ID}`,
          ],
          secondary: [],
        },
        appearance: {
          theme: 'dark',
          accentColor: '#00ff88',
          // Remove logo to hide image in the modal and keep only the login method button
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        supportedChains: [monadTestnet],
      }}
    >
        <Component {...pageProps} />
      </PrivyProvider>
    </>
  );
}

export default MyApp;

