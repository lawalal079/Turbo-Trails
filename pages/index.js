import { usePrivy, useLogin } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
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
      setPlayerData(data);
    } catch (error) {
      console.error('Error fetching player data:', error);
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

  const endGame = (score) => {
    if (gameMode === 'career') {
      submitScore(score);
    }
    setGameState('menu');
    setGameMode(null);
  };

  const submitScore = async (score) => {
    try {
      await fetch('/api/submit-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet: getWalletAddress(),
          score: score,
        }),
      });
      // Refresh player data after score submission
      const walletAddress = getWalletAddress();
      if (walletAddress) {
        fetchPlayerData(walletAddress);
      }
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  };

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
        <div className="auth-content">
          <h1 className="game-title">TURBO TRAILS</h1>
          <p className="game-subtitle">Web3 Blockchain Racing</p>
          
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
        />
      )}
      
      {gameState === 'shop' && (
        <Shop
          playerData={playerData}
          onBackToMenu={() => setGameState('menu')}
          onPurchase={fetchPlayerData}
        />
      )}
      
      {gameState === 'leaderboard' && (
        <Leaderboard
          onBackToMenu={() => setGameState('menu')}
        />
      )}
    </div>
  );
}
