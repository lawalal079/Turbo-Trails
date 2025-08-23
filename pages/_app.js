import { PrivyProvider } from '@privy-io/react-auth';
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
          logo: '/logo.png',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        supportedChains: [monadTestnet],
      }}
    >
      <Component {...pageProps} />
    </PrivyProvider>
  );
}

export default MyApp;

