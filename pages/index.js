import { usePrivy, useLogin } from '@privy-io/react-auth';
import { useState, useEffect, useRef } from 'react';
import GameEngine from '../components/GameEngine';
import MainMenu from '../components/MainMenu';
import Shop from '../components/Shop';
import Leaderboard from '../components/Leaderboard';

export default function Home() {
  const { logout, authenticated, user, ready } = usePrivy();
  const { login } = useLogin();
  const [gameState, setGameState] = useState('menu'); // menu, game, shop, leaderboard
  const [gameMode, setGameMode] = useState(null); // career, pvp, ghost
  const [playerData, setPlayerData] = useState(null);
  const [username, setUsername] = useState('');
  const [selectedBikeProfile, setSelectedBikeProfile] = useState('default');
  const pendingResultRef = useRef(null);
  const submittedRef = useRef(false);
  // Simple toast system (non-blocking ephemeral notices)
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, duration);
  };

  // Fetch player data when authenticated
  useEffect(() => {
    if (authenticated && user && ready) {
      // Check for Monad Games ID cross-app account
      const crossAppAccount = user.linkedAccounts?.find(
        account => account.type === "cross_app" && account.providerApp?.id === process.env.NEXT_PUBLIC_MONAD_GAMES_CROSS_APP_ID
      );

      if (crossAppAccount?.embeddedWallets?.length > 0) {
        const walletAddress = crossAppAccount.embeddedWallets[0].address;
        fetchPlayerData(walletAddress);
        fetchUsername(walletAddress);
      } else if (user.wallet?.address) {
        // Fallback to regular wallet
        fetchPlayerData(user.wallet.address);
        fetchUsername(user.wallet.address);
      }
    }
  }, [authenticated, user, ready]);

  const fetchPlayerData = async (walletAddress) => {
    try {
      const response = await fetch(`/api/player-data?wallet=${walletAddress}`);
      const data = await response.json();
      // API returns { success, playerData }
      const pd = data?.playerData || null;
      setPlayerData(pd);
      return pd;
    } catch (error) {
      console.error('Error fetching player data:', error);
      return null;
    }
  };

  const fetchUsername = async (walletAddress) => {
    try {
      const response = await fetch(`https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${walletAddress}`);
      const data = await response.json();
      setUsername(data.hasUsername ? data.user.username : 'Anonymous');
    } catch (error) {
      console.error('Error fetching username:', error);
      setUsername('Anonymous');
    }
  };

  const getWalletAddress = () => {
    if (!user) return null;
    
    // Check for Monad Games ID cross-app account first
    const crossAppAccount = user.linkedAccounts?.find(
      account => account.type === "cross_app" && account.providerApp?.id === process.env.NEXT_PUBLIC_MONAD_GAMES_CROSS_APP_ID
    );

    if (crossAppAccount?.embeddedWallets?.length > 0) {
      return crossAppAccount.embeddedWallets[0].address;
    }

    // Fallback to regular wallet
    return user.wallet?.address || null;
  };

  const startGame = (mode) => {
    setGameMode(mode);
    setGameState('game');
  };

  const endGame = async (payload) => {
    const isObj = payload && typeof payload === 'object';
    const score = isObj ? Number(payload.score || 0) : Number(payload || 0);
    const distanceKm = isObj ? Number(payload.distanceKm || 0) : undefined;
    const wallet = getWalletAddress();
    if (gameMode === 'career') {
      const prevBest = playerData?.bestScore || 0;
      pendingResultRef.current = { wallet, score, distanceKm };
      submittedRef.current = false;
      try {
        await submitScore(score, distanceKm, prevBest);
        submittedRef.current = true;
      } catch (_) {
        // leave pending for beacon fallback
      }
    }
    setGameState('menu');
    setGameMode(null);
  };

  const submitScore = async (score, distanceKm, prevBest = 0) => {
    try {
      const resp = await fetch('/api/client-submit-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet: getWalletAddress(),
          score: score,
          distanceKm: typeof distanceKm === 'number' ? distanceKm : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('Score submit failed:', data);
        addToast('Failed to submit score', 'error');
      } else {
        console.log('Score submitted:', data);
        // Surface non-blocking notices in the UI
        if (data && data.mintError) {
          console.warn('Mint error (leaderboard still updated):', data.mintError);
          addToast('Score saved! Minting issue, leaderboard updated.', 'warning');
        } else if (data && data.pending) {
          addToast('Score saved! Mint pending confirmation…', 'info');
        } else if (data && data.success) {
          if (typeof data.tokensEarned === 'number' && data.tokensEarned > 0) {
            addToast(`Minted ${data.tokensEarned} TURBO`, 'success');
          } else {
            addToast('Score saved!', 'success');
          }
        }
      }
      // Refresh player data after score submission
      const walletAddress = getWalletAddress();
      if (walletAddress) {
        const updated = await fetchPlayerData(walletAddress);
        if (updated) {
          addToast('Player data updated', 'info');
          const newBest = Number(updated.bestScore || 0);
          if (newBest > Number(prevBest || 0)) {
            addToast('New personal best! 🏆', 'success');
          }
        }
      }
    } catch (error) {
      console.error('Error submitting score:', error);
      addToast('Network error submitting score', 'error');
    }
  };

  // Background submission on page hide/close using sendBeacon
  useEffect(() => {
    const handler = () => {
      try {
        const pending = pendingResultRef.current;
        if (!pending || submittedRef.current) return;
        const payload = {
          wallet: pending.wallet || getWalletAddress(),
          score: Number(pending.score || 0),
          distanceKm: typeof pending.distanceKm === 'number' ? Number(pending.distanceKm) : undefined,
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/client-submit-score', blob);
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, []);

  // Resolve the current wallet address (prefers cross-app)
  const walletAddress = getWalletAddress();

  if (!ready) {
    return (
      <div className="auth-container">
        <div className="auth-content">
          <h1 className="game-title">TURBO TRAILS</h1>
          <p className="game-subtitle">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="auth-container">
        {/* Decorative hero bike (shows embedded title area) */}
        <img src="/brand/login-bike.png" alt="Turbo Trails bike" className="auth-hero-bike" />
        <div className="auth-content minimal">
          <div className="auth-buttons">
            <button disabled={!ready || authenticated} onClick={login} className="auth-button">
              Sign in with Monad Games ID
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {gameState === 'menu' && (
        <MainMenu
          username={username}
          playerData={playerData}
          walletAddress={walletAddress}
          onLogin={login}
          onStartGame={startGame}
          onOpenShop={() => setGameState('shop')}
          onOpenLeaderboard={() => setGameState('leaderboard')}
          onLogout={logout}
          onSelectBikeProfile={(key) => setSelectedBikeProfile(key)}
          selectedBikeProfile={selectedBikeProfile}
        />
      )}
      
      {gameState === 'game' && (
        <GameEngine
          gameMode={gameMode}
          playerData={playerData}
          onGameEnd={endGame}
          onBackToMenu={() => setGameState('menu')}
          bikeProfile={selectedBikeProfile}
          walletAddress={walletAddress}
        />
      )}
      
      {gameState === 'shop' && (
        <Shop
          playerData={playerData}
          onBackToMenu={() => setGameState('menu')}
          onPurchase={() => {
            const addr = getWalletAddress();
            if (addr) fetchPlayerData(addr);
          }}
        />
      )}
      
      {gameState === 'leaderboard' && (
        <Leaderboard
          onBackToMenu={() => setGameState('menu')}
          currentWallet={walletAddress}
        />
      )}
      {/* Toast container */}
      <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '10px 12px',
            borderRadius: 8,
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            background: t.type === 'success' ? '#16a34a' : t.type === 'warning' ? '#d97706' : t.type === 'error' ? '#dc2626' : '#334155',
            minWidth: 220,
            fontSize: 14
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
