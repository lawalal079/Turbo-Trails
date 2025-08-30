import { useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { useWallets, usePrivy, useCrossAppAccounts } from '@privy-io/react-auth';

export default function MainMenu({ 
  username, 
  playerData, 
  walletAddress,
  onLogin,
  onStartGame, 
  onOpenShop, 
  onOpenLeaderboard, 
  onLogout,
  onSelectBikeProfile,
  selectedBikeProfile = 'sport'
}) {
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [openUserMenu, setOpenUserMenu] = useState(false);
  const menuRef = useRef(null);
  const [monBalance, setMonBalance] = useState(null);
  const [sending, setSending] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendHash, setSendHash] = useState('');
  // TURBO send states
  const [showSendTurboModal, setShowSendTurboModal] = useState(false);
  const [turboTo, setTurboTo] = useState('');
  const [turboAmount, setTurboAmount] = useState('');
  const [turboError, setTurboError] = useState('');
  const [turboHash, setTurboHash] = useState('');
  const [sendingTurbo, setSendingTurbo] = useState(false);
  const { wallets } = useWallets?.() || { wallets: [] };
  const { user } = usePrivy();
  const { sendTransaction: sendCrossAppTransaction } = useCrossAppAccounts();
  const [gasEstimateMon, setGasEstimateMon] = useState(null);
  const [maxAvailableMon, setMaxAvailableMon] = useState(null);
  const MONAD_CHAIN_ID_HEX = '0x279f'; // 10143
  const [activeSignerAddr, setActiveSignerAddr] = useState('');
  const [activeChainHex, setActiveChainHex] = useState('');
  const [balanceMon, setBalanceMon] = useState(null);
  const [resolvedUsername, setResolvedUsername] = useState(null);
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameRedirected, setUsernameRedirected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Get the Monad Games ID cross-app wallet provider
  const getProviderForAddress = async () => {
    console.log('getProviderForAddress called:', { walletAddress, walletsCount: wallets?.length });
    
    // First try to find the cross-app account directly from user data
    if (user?.linkedAccounts) {
      const crossAppAccount = user.linkedAccounts.find(
        account => account.type === "cross_app" && 
        account.providerApp?.id === process.env.NEXT_PUBLIC_MONAD_GAMES_CROSS_APP_ID
      );
      
      console.log('Cross-app account found:', !!crossAppAccount);
      
      if (crossAppAccount?.embeddedWallets?.length > 0) {
        const crossAppWallet = crossAppAccount.embeddedWallets[0];
        console.log('Cross-app wallet address:', crossAppWallet.address);
        
        // Try to find this wallet in the wallets array
        const matchingWallet = wallets?.find(w => 
          w?.address?.toLowerCase() === crossAppWallet.address?.toLowerCase()
        );
        
        if (matchingWallet?.getEthereumProvider) {
          try {
            console.log('Found cross-app wallet in wallets array, getting provider...');
            const provider = await matchingWallet.getEthereumProvider();
            console.log('Successfully got provider from cross-app wallet');
            return provider;
          } catch (e) {
            console.warn('Failed to get provider from cross-app wallet:', e);
          }
        }
      }
    }
    
    // Fallback to any available embedded wallet
    console.log('Falling back to any available wallet...');
    if (!wallets || wallets.length === 0) {
      console.log('No wallets available');
      return null;
    }
    
    for (const wallet of wallets) {
      if (!wallet?.getEthereumProvider) continue;
      
      const walletType = (wallet?.walletClientType || wallet?.type || '').toLowerCase();
      const isEmbedded = walletType.includes('privy') || walletType.includes('embedded');
      
      console.log('Checking fallback wallet:', { 
        address: wallet?.address, 
        type: walletType, 
        isEmbedded
      });
      
      if (isEmbedded) {
        try {
          console.log('Using fallback embedded wallet');
          return await wallet.getEthereumProvider();
        } catch (e) {
          console.warn('Failed to get provider from fallback wallet:', e);
          continue;
        }
      }
    }
    
    console.log('No wallet provider found');
    return null;
  };

  const handleSendTurbo = async (e) => {
    e?.preventDefault?.();
    setTurboError('');
    setTurboHash('');
    if (!turboTo || !ethers.isAddress(turboTo)) {
      setTurboError('Enter a valid recipient address');
      return;
    }
    const amt = Number(turboAmount);
    if (!amt || amt <= 0) {
      setTurboError('Enter a valid amount');
      return;
    }
    const tokenAddress = process.env.NEXT_PUBLIC_TURBO_TOKEN_CONTRACT_ADDRESS || process.env.TURBO_TOKEN_CONTRACT_ADDRESS;
    if (!tokenAddress) {
      setTurboError('TURBO token address not configured');
      return;
    }
    try {
      setSendingTurbo(true);
      const ethProvider = await getProviderForAddress();
      if (!ethProvider) throw new Error('Embedded wallet provider unavailable');

      // Ensure Monad testnet
      try {
        const current = await ethProvider.request({ method: 'eth_chainId' });
        if ((current || '').toLowerCase() !== MONAD_CHAIN_ID_HEX) {
          try { await ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_ID_HEX }] }); } catch {}
        }
      } catch {}

      const provider = new ethers.BrowserProvider(ethProvider);
      const signer = await provider.getSigner();

      // Minimal ERC-20 ABI
      const erc20Abi = [
        'function transfer(address to, uint256 amount) returns (bool)'
      ];
      const turbo = new ethers.Contract(tokenAddress, erc20Abi, signer);
      const amountWei = ethers.parseUnits(String(turboAmount), 18);
      const tx = await turbo.transfer(turboTo, amountWei);
      const receipt = await tx.wait();
      const hash = receipt?.hash || tx?.hash;
      setTurboHash(hash);
      setTurboTo('');
      setTurboAmount('');
    } catch (err) {
      const msg = String(err?.message || err || 'Failed to send TURBO');
      if (/insufficient funds/i.test(msg)) setTurboError('Insufficient funds or gas.');
      else if (/user rejected|denied/i.test(msg)) setTurboError('Transaction rejected.');
      else setTurboError(msg);
    } finally {
      setSendingTurbo(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // When Send modal opens, compute estimated gas and max available
  useEffect(() => {
    const computeEstimates = async () => {
      if (!showSendModal) return;
      try {
        const ethProvider = await getProviderForAddress();
        if (!ethProvider) {
          setGasEstimateMon(null);
          setMaxAvailableMon(null);
          return;
        }
        // ensure chain is Monad testnet
        try {
          const current = await ethProvider.request({ method: 'eth_chainId' });
          setActiveChainHex((current || '').toLowerCase());
          if ((current || '').toLowerCase() !== MONAD_CHAIN_ID_HEX) {
            try {
              await ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_ID_HEX }] });
            } catch {}
          }
        } catch {}
        const provider = new ethers.BrowserProvider(ethProvider);
        const signer = await provider.getSigner();
        const fromAddr = await signer.getAddress();
        setActiveSignerAddr(fromAddr);
        const [feeData, balanceWei] = await Promise.all([
          provider.getFeeData(),
          provider.getBalance(fromAddr),
        ]);
        const gasLimit = 21000n;
        let feeEstimateWei = 0n;
        if (feeData.maxFeePerGas) feeEstimateWei = feeData.maxFeePerGas * gasLimit; else if (feeData.gasPrice) feeEstimateWei = feeData.gasPrice * gasLimit;
        const gasMon = Number(ethers.formatEther(feeEstimateWei));
        const spendable = balanceWei > feeEstimateWei ? (balanceWei - feeEstimateWei) : 0n;
        const maxMon = Number(ethers.formatEther(spendable));
        setGasEstimateMon(gasMon);
        setMaxAvailableMon(maxMon);
        setBalanceMon(Number(ethers.formatEther(balanceWei)));
      } catch {
        setGasEstimateMon(null);
        setMaxAvailableMon(null);
        setBalanceMon(null);
      }
    };
    computeEstimates();
  }, [showSendModal, wallets, walletAddress]);

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : 'No wallet';

  const formattedAddress = walletAddress
    ? `${walletAddress.slice(0, 5)}...${walletAddress.slice(-4).toUpperCase()}`
    : 'N/A';

  // Fetch MON balance from Monad Testnet
  useEffect(() => {
    let cancelled = false;
    const fetchBalance = async () => {
      if (!walletAddress) {
        setMonBalance(null);
        return;
      }
      try {
        const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
        const bal = await provider.getBalance(walletAddress);
        const eth = Number(ethers.formatEther(bal));
        const display = eth < 0.0001 ? '0 MON' : `${eth.toFixed(4)} MON`;
        if (!cancelled) setMonBalance(display);
      } catch (e) {
        if (!cancelled) setMonBalance('—');
      }
    };
    fetchBalance();
    return () => { cancelled = true; };
  }, [walletAddress]);

  // Fetch username from Monad Games ID service
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!walletAddress) {
        setResolvedUsername(null);
        return;
      }
      try {
        setUsernameLoading(true);
        const url = `https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${encodeURIComponent(walletAddress)}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`Username fetch failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.hasUsername && data?.user?.username) {
          setResolvedUsername(String(data.user.username));
        } else {
          setResolvedUsername(null);
          // One-time auto-redirect to register username for first-time users
          if (!usernameRedirected) {
            try {
              window.open('https://monad-games-id-site.vercel.app/', '_blank');
              setUsernameRedirected(true);
            } catch {}
          }
        }
      } catch (e) {
        if (!cancelled) setResolvedUsername(null);
      } finally {
        if (!cancelled) setUsernameLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [walletAddress, usernameRedirected]);

  const refreshBalance = async () => {
    if (!walletAddress) return;
    setRefreshing(true);
    try {
      const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
      const balance = await provider.getBalance(walletAddress);
      const balanceInMon = parseFloat(ethers.formatEther(balance));
      setBalanceMon(balanceInMon);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    } finally {
      setTimeout(() => setRefreshing(false), 1000); // Keep spinning for at least 1 second
    }
  };

  const handleSendMon = async (e) => {
    e?.preventDefault?.();
    setSendError('');
    setSendHash('');
    if (!sendTo || !ethers.isAddress(sendTo)) {
      setSendError('Enter a valid recipient address');
      return;
    }
    const amt = Number(sendAmount);
    if (!amt || amt <= 0) {
      setSendError('Enter a valid amount');
      return;
    }
    
    try {
      setSending(true);
      
      // Find the cross-app account
      const crossAppAccount = user?.linkedAccounts?.find(
        account => account.type === "cross_app" && 
        account.providerApp?.id === process.env.NEXT_PUBLIC_MONAD_GAMES_CROSS_APP_ID
      );
      
      if (!crossAppAccount?.embeddedWallets?.length) {
        throw new Error('Monad Games ID wallet not found');
      }
      
      const address = crossAppAccount.embeddedWallets[0].address;
      console.log('Using cross-app wallet:', address);
      
      // Use the correct useCrossAppAccounts sendTransaction format from Privy docs
      const txHash = await sendCrossAppTransaction(
        {
          chainId: 10143, // Monad testnet
          to: sendTo,
          value: ethers.parseEther(sendAmount).toString(),
          gasLimit: 21000
        },
        { address }
      );
      
      setSendHash(txHash);
      await refreshBalance();
      setSendTo('');
      setSendAmount('');
    } catch (err) {
      const msg = String(err?.message || err || 'Failed to send');
      if (/insufficient funds/i.test(msg)) {
        setSendError('Insufficient funds (amount + gas). Try a smaller amount.');
      } else if (/user rejected|denied/i.test(msg)) {
        setSendError('Transaction rejected.');
      } else if (/chain|network/i.test(msg)) {
        setSendError('Network error. Please try again.');
      } else {
        setSendError(msg);
      }
    } finally {
      setSending(false);
    }
  };

  const handlePrefillMax = async () => {
    try {
      setSendError('');
      const ethProvider = await getProviderForAddress();
      if (!ethProvider) {
        throw new Error('Embedded wallet provider unavailable');
      }

      // Ensure Monad testnet
      const current = await ethProvider.request({ method: 'eth_chainId' });
      if ((current || '').toLowerCase() !== MONAD_CHAIN_ID_HEX) {
        try {
          await ethProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_ID_HEX }] });
        } catch {}
      }

      const provider = new ethers.BrowserProvider(ethProvider);
      const signer = await provider.getSigner();
      const signerAddr = (await signer.getAddress())?.toLowerCase();
      if (walletAddress && signerAddr !== walletAddress.toLowerCase()) {
        // Not a fatal error, but informs UX if needed
      }
      const fromAddr = await signer.getAddress();
      const balanceWei = await provider.getBalance(fromAddr);
      const feeData = await provider.getFeeData();
      const gasLimit = 21000n;
      let feeEstimateWei = 0n;
      if (feeData.maxFeePerGas) {
        feeEstimateWei = feeData.maxFeePerGas * gasLimit;
      } else if (feeData.gasPrice) {
        feeEstimateWei = feeData.gasPrice * gasLimit;
      }
      const spendable = balanceWei > feeEstimateWei ? (balanceWei - feeEstimateWei) : 0n;
      if (spendable <= 0n) {
        setSendError('Balance too low to cover gas.');
        return;
      }
      // Format with up to 6 decimals for UX
      const maxStr = ethers.formatEther(spendable);
      const [int, dec=''] = maxStr.split('.');
      const truncated = dec ? `${int}.${dec.slice(0,6)}` : int;
      setSendAmount(truncated);
    } catch (err) {
      setSendError(err?.message || 'Failed to compute max');
    }
  };

  const handleStartCareer = () => {
    onStartGame('career');
  };

  const handleHeadToHead = () => {
    setShowModeSelection(true);
  };

  const handleRaceMode = (mode) => {
    onStartGame(mode);
    setShowModeSelection(false);
  };

  const displayName = resolvedUsername || username || 'Player';

  // Simple gating: unlock bikes by playerData.bikeLevel (fallback if inventory mapping is not available)
  // default: always unlocked
  // cruiser: level >= 1
  // sport: level >= 2
  // hyper: level >= 3
  const bikeLevel = Number(playerData?.bikeLevel || 0);
  const unlocked = {
    default: true,
    cruiser: bikeLevel >= 1,
    sport: bikeLevel >= 2,
    hyper: bikeLevel >= 3,
  };

  // Prevent selecting locked bikes; if current selection becomes locked, fallback to first unlocked
  useEffect(() => {
    if (!unlocked[selectedBikeProfile]) {
      const order = ['hyper', 'sport', 'cruiser', 'default'];
      const firstUnlocked = order.reverse().find((k) => unlocked[k]);
      if (firstUnlocked && onSelectBikeProfile) onSelectBikeProfile(firstUnlocked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bikeLevel]);

  return (
    <>
      <div className="main-menu">
        {/* Top bar with title and user menu */}
        <div className="menu-header">
          <h1 className="game-title">TURBO TRAILS</h1>
        </div>

        {/* Username CTA outside the dropdown */}
        {(!usernameLoading && !resolvedUsername) && (
          <div className="username-cta" style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
            <button
              className="reserve-username-btn"
              onClick={() => {
                try { window.open('https://monad-games-id-site.vercel.app/', '_blank'); } catch {}
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: '#0ff',
                color: '#000',
                fontWeight: 700,
                border: '1px solid rgba(0,255,255,0.4)',
                cursor: 'pointer'
              }}
            >
              Reserve username
            </button>
          </div>
        )}

        {/* Top-right user menu */}
        <div className="user-menu-container" ref={menuRef}>
          <button
            className="user-chip"
            onClick={() => setOpenUserMenu((v) => !v)}
            aria-haspopup="true"
            aria-expanded={openUserMenu}
          >
            <span className="user-name">{displayName}</span>
            <span className="user-wallet">{shortAddress}</span>
          </button>
          {openUserMenu && (
            <div className="user-dropdown" role="menu">
              <div className="wallet-header">
                <div className="wallet-title">Monad Games ID wallet</div>
                <div className="wallet-right">
                  <button
                    className={`refresh-icon ${refreshing ? 'spinning' : ''}`}
                    onClick={refreshBalance}
                    title="Refresh balance"
                    aria-label="Refresh balance"
                  >
                    ↻
                  </button>
                  <div className="wallet-badge" title="Balance on Monad testnet">{monBalance ?? '—'}</div>
                </div>
              </div>
              {!resolvedUsername && (
                <div className="username-hint">
                  <span>{usernameLoading ? 'Checking username…' : 'No username reserved.'}</span>
                  {!usernameLoading && (
                    <a href="https://monad-games-id-site.vercel.app/" target="_blank" rel="noopener noreferrer">
                      Reserve username →
                    </a>
                  )}

      {showSendTurboModal && (
        <div className="send-modal-overlay" role="dialog" aria-modal="true">
          <div className="send-modal">
            <div className="send-modal-header">
              <h3>Send TURBO</h3>
              <button className="close-btn" onClick={() => setShowSendTurboModal(false)}>×</button>
            </div>
            <div className="send-modal-body">
              <div className="input-group">
                <label>Recipient</label>
                <div className="recipient-input-container">
                  <input
                    type="text"
                    value={turboTo}
                    onChange={(e) => setTurboTo(e.target.value)}
                    placeholder="0x..."
                  />
                  <button
                    className="paste-btn"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (ethers.isAddress(text)) setTurboTo(text);
                      } catch (err) {
                        console.warn('Failed to paste:', err);
                      }
                    }}
                  >
                    Paste
                  </button>
                  {turboTo && (
                    <button className="clear-btn" onClick={() => setTurboTo('')}>×</button>
                  )}
                </div>
              </div>
              <div className="input-group">
                <label>Amount (TURBO)</label>
                <div className="amount-input-container">
                  <input
                    type="number"
                    step="0.0001"
                    value={turboAmount}
                    onChange={(e) => setTurboAmount(e.target.value)}
                    placeholder="10.0"
                  />
                </div>
              </div>
              {turboError && <div className="error-message">{turboError}</div>}
              {turboHash && (
                <div className="success-message">
                  Sent! Tx: <a href={`https://testnet-explorer.monad.xyz/tx/${turboHash}`} target="_blank" rel="noopener noreferrer">{turboHash.slice(0, 10)}...</a>
                </div>
              )}
            </div>
            <div className="send-modal-footer">
              <button className="cancel-btn" onClick={() => setShowSendTurboModal(false)}>Cancel</button>
              <button
                className="send-btn"
                onClick={handleSendTurbo}
                disabled={sendingTurbo || !turboTo || !turboAmount}
              >
                {sendingTurbo ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
                </div>
              )}
              <div className="wallet-address-line">
                <span className="address-text">{shortAddress}</span>
                <button
                  className="copy-btn"
                  onClick={async () => {
                    if (walletAddress) {
                      await navigator.clipboard.writeText(walletAddress);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="wallet-actions">
                <button className="send-btn" onClick={() => setShowSendModal(true)}>Send MON</button>
                <button className="send-btn" onClick={() => setShowSendTurboModal(true)}>Send TURBO</button>
              </div>
              <div className="dropdown-divider" />
              <button className="logout-row" onClick={onLogout}>Logout</button>
            </div>
          )}
        </div>

        {!showModeSelection ? (
          <div className="menu-content">
            {/* Bike selection removed per request */}

            <div className="game-modes">
              <button 
                className="mode-button career-mode"
                onClick={handleStartCareer}
              >
                <div className="mode-icon">🏁</div>
                <div className="mode-info">
                  <h3>Career Mode</h3>
                  <p>Endless racing for high scores and TURBO tokens</p>
                </div>
              </button>

              <button 
                className="mode-button pvp-mode"
                onClick={handleHeadToHead}
              >
                <div className="mode-icon">⚔️</div>
                <div className="mode-info">
                  <h3>Head-to-Head</h3>
                  <p>Race against friends or ghosts</p>
                </div>
              </button>
            </div>

            <div className="menu-actions">
              <button className="menu-button shop-button" onClick={onOpenShop}>
                🛒 Shop
              </button>
              <button className="menu-button leaderboard-button" onClick={onOpenLeaderboard}>
                📊 Leaderboard
              </button>
              <button className="menu-button logout-button" onClick={onLogout}>
                🚪 Logout
              </button>
            </div>
          </div>
        ) : (
          <div className="mode-selection">
            <h2>Choose Race Type</h2>
            <div className="race-options">
              <button 
                className="race-option pvp-option disabled"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                aria-disabled="true"
                disabled
                title="Coming soon"
                style={{ opacity: 0.6, cursor: 'not-allowed', position: 'relative' }}
              >
                <div className="option-icon">👥</div>
                <div className="option-info">
                  <h3>Race a Friend</h3>
                  <p>Live PvP with betting</p>
                </div>
                <div 
                  className="coming-soon-badge"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: '#222',
                    color: '#0ff',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    border: '1px solid rgba(0,255,255,0.3)'
                  }}
                >
                  Coming soon
                </div>
              </button>

              <button 
                className="race-option ghost-option disabled"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                aria-disabled="true"
                disabled
                title="Coming soon"
                style={{ opacity: 0.6, cursor: 'not-allowed', position: 'relative' }}
              >
                <div className="option-icon">👻</div>
                <div className="option-info">
                  <h3>Race a Ghost</h3>
                  <p>Solo race against recorded runs</p>
                </div>
                <div 
                  className="coming-soon-badge"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: '#222',
                    color: '#0ff',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    border: '1px solid rgba(0,255,255,0.3)'
                  }}
                >
                  Coming soon
                </div>
              </button>
            </div>

            <button 
              className="back-button"
              onClick={() => setShowModeSelection(false)}
            >
              ← Back
            </button>
          </div>
        )}

        <div className="menu-footer">
          <p>Web3 Blockchain Racing Game</p>
        </div>
      </div>

      {showSendModal && (
        <div className="send-modal-overlay" role="dialog" aria-modal="true">
          <div className="send-modal">
            <div className="send-modal-header">
              <h3>Send MON</h3>
              <button className="close-btn" onClick={() => setShowSendModal(false)}>×</button>
            </div>
            <div className="send-modal-body">
              <div className="input-group">
                <label>Recipient</label>
                <div className="recipient-input-container">
                  <input
                    type="text"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    placeholder="0x..."
                  />
                  <button
                    className="paste-btn"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (ethers.isAddress(text)) {
                          setSendTo(text);
                        }
                      } catch (err) {
                        console.warn('Failed to paste:', err);
                      }
                    }}
                  >
                    Paste
                  </button>
                  {sendTo && (
                    <button
                      className="clear-btn"
                      onClick={() => setSendTo('')}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="input-group">
                <label>Amount (MON)</label>
                <div className="amount-input-container">
                  <input
                    type="number"
                    step="0.01"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0.01"
                  />
                  <button
                    className="max-btn"
                    onClick={() => {
                      const max = maxAvailableMon ? parseFloat(maxAvailableMon.replace(' MON', '')) : 0;
                      setSendAmount(max > 0 ? max.toString() : '0');
                    }}
                  >
                    Max
                  </button>
                </div>
              </div>
              {sendError && <div className="error-message">{sendError}</div>}
              {sendHash && (
                <div className="success-message">
                  Sent! Tx: <a href={`https://testnet-explorer.monad.xyz/tx/${sendHash}`} target="_blank" rel="noopener noreferrer">{sendHash.slice(0, 10)}...</a>
                </div>
              )}
            </div>
            <div className="send-modal-footer">
              <button className="cancel-btn" onClick={() => setShowSendModal(false)}>Cancel</button>
              <button
                className="send-btn"
                onClick={handleSendMon}
                disabled={sending || !sendTo || !sendAmount}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
