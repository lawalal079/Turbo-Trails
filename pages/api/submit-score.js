import { ethers } from 'ethers';
import { upsertScore } from '../../lib/leaderboardStore';

// Contract ABIs (simplified)
const TURBO_TOKEN_ABI = [
  "function mint(address to, uint256 amount) external",
  "function ownerMint(address to, uint256 amount) external"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth: In production, always enforce API_SECRET via x-api-key.
    // In development, allow missing API_SECRET to unblock local testing.
    const isProd = process.env.NODE_ENV === 'production';
    const expected = process.env.API_SECRET || '';
    const provided = req.headers['x-api-key'];
    if (isProd || expected) {
      if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Unauthorized: invalid or missing x-api-key' });
      }
    } else {
      
    }

    const { wallet, score, distanceKm } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet address' });
    }

    // Reward calculation config
    const rewardMode = (process.env.REWARD_MODE || 'distance').toLowerCase(); // 'distance' | 'score'
    const maxPerRun = Number(process.env.MAX_TOKENS_PER_RUN || '0'); // 0 = no cap

    // Determine units and validate
    let units;
    if (rewardMode === 'distance') {
      if (typeof distanceKm !== 'number') {
        // Fallback: derive from score if provided so runs still mint in case UI missed distance
        if (typeof score === 'number') {
          
        } else {
          return res.status(400).json({ error: 'distanceKm (number) required when REWARD_MODE=distance' });
        }
      }
      if (distanceKm < 0 || distanceKm > 10000) {
        return res.status(400).json({ error: 'Invalid distance range' });
      }
      units = distanceKm;
    } else {
      if (typeof score !== 'number') {
        return res.status(400).json({ error: 'score (number) required when REWARD_MODE=score' });
      }
      if (score < 0 || score > 1000000) {
        return res.status(400).json({ error: 'Invalid score range' });
      }
      units = score;
    }

    // Setup blockchain connection
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const serverPk = process.env.PRIVATE_KEY;
    const serverWallet = serverPk ? new ethers.Wallet(serverPk, provider) : null;

    // Calculate tokens earned (human-readable) and on-chain units (18 decimals)
    let tokensEarned;
    if (rewardMode === 'distance') {
      // 1 token per km, round to 2 decimals; if distance missing, fallback to score/10
      if (typeof distanceKm === 'number') {
        tokensEarned = Math.round(distanceKm * 100) / 100;
      } else {
        tokensEarned = Math.floor((Number(score) || 0) / 10);
      }
    } else {
      // 10 score => 1 token
      tokensEarned = Math.floor((Number(units) || 0) / 10);
    }
    if (maxPerRun > 0 && tokensEarned > maxPerRun) tokensEarned = maxPerRun;
    // Ensure precise 2dp string to avoid float artifacts when parsing units
    const tokensStr = Number.isFinite(tokensEarned) ? tokensEarned.toFixed(2) : '0.00';
    const decimals = 18;
    const mintAmount = ethers.parseUnits(tokensStr, decimals);

    

    // Zero-mint guard: upsert leaderboard but skip chain tx
    if (!tokensStr || parseFloat(tokensStr) <= 0) {
      try {
        await upsertScore({ wallet, score: typeof score === 'number' ? score : 0, tokensEarned: 0 });
      } catch (e) {
        
      }
      return res.status(200).json({
        success: true,
        transactionHash: null,
        tokensEarned: 0,
        pending: false,
        message: 'Score submitted. No tokens to mint for this run.'
      });
    }

    // Persist to local leaderboard (career mode: best score) immediately
    try {
      await upsertScore({ wallet, score: typeof score === 'number' ? score : 0, tokensEarned: Number(tokensStr) });
    } catch (e) {
      
    }

    let tx, receipt, txHash;

    // Dev-only: ownerMint to cut friction
    const isDevMint = process.env.DIRECT_MINT_DEV === 'true' || process.env.NODE_ENV !== 'production';
    
    if (isDevMint) {
      const turboAddr = process.env.TURBO_TOKEN_CONTRACT_ADDRESS;
      if (!turboAddr) {
        throw new Error('DIRECT_MINT_DEV: TURBO_TOKEN_CONTRACT_ADDRESS not set');
      }
      const ownerPk = process.env.OWNER_PRIVATE_KEY;
      if (!ownerPk) {
        throw new Error('DIRECT_MINT_DEV: OWNER_PRIVATE_KEY not set');
      }
      const ownerSigner = new ethers.Wallet(ownerPk, provider);
      const turbo = new ethers.Contract(turboAddr, TURBO_TOKEN_ABI, ownerSigner);
      tx = await turbo.ownerMint(wallet, mintAmount);
      txHash = tx?.hash;
      
      receipt = await tx.wait().catch(() => null);
      if (receipt && receipt.hash) {
        
      }
      // proceed to MGID update and response handling below
    } else {
      // Production/non-dev path: try turbo.mint with server wallet as authorized minter
      const turboAddr = process.env.TURBO_TOKEN_CONTRACT_ADDRESS;
      if (!turboAddr) {
        throw new Error('TURBO_TOKEN_CONTRACT_ADDRESS not set');
      }
      if (!serverWallet) {
        throw new Error('PRIVATE_KEY not set for server minter');
      }
      const turbo = new ethers.Contract(turboAddr, TURBO_TOKEN_ABI, serverWallet);
      try {
        tx = await turbo.mint(wallet, mintAmount);
        txHash = tx?.hash;
        
        receipt = await tx.wait().catch(() => null);
        if (receipt && receipt.hash) {
          
        }
      } catch (mintErr) {
        
        const ownerPk = process.env.OWNER_PRIVATE_KEY;
        if (!ownerPk) {
          throw new Error('turbo.mint failed and OWNER_PRIVATE_KEY not set for ownerMint fallback');
        }
        const ownerSigner = new ethers.Wallet(ownerPk, provider);
        const turboOwner = new ethers.Contract(turboAddr, TURBO_TOKEN_ABI, ownerSigner);
        tx = await turboOwner.ownerMint(wallet, mintAmount);
        txHash = tx?.hash;
        
        receipt = await tx.wait().catch(() => null);
        if (receipt && receipt.hash) {
          
        }
      }
    }

    // Backend-only: reflect this in Monad Games ID via secured internal call
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await fetch(`${baseUrl}/api/update-player-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_SECRET || ''
        },
        body: JSON.stringify({
          playerAddress: wallet,
          scoreAmount: score,
          transactionAmount: 1
        })
      });
    } catch (e) {
      
    }

    // Try to wait for mining if not yet available (up to 30s)
    if (!receipt || !receipt.hash) {
      if (txHash) {
        try {
          const mined = await provider.waitForTransaction(txHash, 1, 30000);
          if (mined && mined.hash) {
            receipt = mined;
          }
        } catch (_) {
          // ignore timeout
        }
      }
    }

    if (!receipt || !receipt.hash) {
      // Return success with txHash even if pending; client can poll or rely on wallet
      const hashPart = txHash ? " (" + txHash + ")" : '';
      return res.status(200).json({
        success: true,
        transactionHash: txHash || null,
        tokensEarned: Number(tokensStr),
        pending: true,
        message: 'Score submitted. Mint transaction sent' + hashPart + ' but not yet mined.'
      });
    }

    res.status(200).json({
      success: true,
      transactionHash: receipt.hash,
      tokensEarned: Number(tokensStr),
      message: 'Score submitted successfully! Earned ' + tokensStr + ' TURBO tokens.'
    });

  } catch (error) {
    
    
    // Handle specific error types
    if (error && error.code === 'INSUFFICIENT_FUNDS') {
      return res.status(500).json({ 
        error: 'Server wallet has insufficient funds for gas fees' 
      });
    }
    
    if (error && error.code === 'NETWORK_ERROR') {
      return res.status(500).json({ 
        error: 'Blockchain network error. Please try again later.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to submit score. Please try again later.',
      details: (error && error.message) ? error.message : String(error)
    });
  }
}

