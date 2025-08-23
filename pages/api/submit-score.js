import { ethers } from 'ethers';

// Contract ABIs (simplified for this example)
const GAME_INTERMEDIARY_ABI = [
  "function submitScoreAndMintTokens(address player, uint256 score) external"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Require backend API key so only server/authorized callers can submit scores
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== (process.env.API_SECRET || '')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { wallet, score } = req.body;

    if (!wallet || typeof score !== 'number') {
      return res.status(400).json({ error: 'Invalid wallet address or score' });
    }

    // Validate score (basic anti-cheat)
    if (score < 0 || score > 1000000) {
      return res.status(400).json({ error: 'Invalid score range' });
    }

    // Setup blockchain connection
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const serverWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Connect to intermediary contract
    const intermediaryContract = new ethers.Contract(
      process.env.INTERMEDIARY_CONTRACT_ADDRESS,
      GAME_INTERMEDIARY_ABI,
      serverWallet
    );

    console.log(`Submitting score ${score} for player ${wallet}`);

    // Submit score and mint tokens
    const tx = await intermediaryContract.submitScoreAndMintTokens(wallet, score);
    const receipt = await tx.wait();

    console.log(`Transaction successful: ${receipt.transactionHash}`);

    // Calculate tokens earned
    const tokensEarned = score * 10; // 1 score = 10 TURBO tokens

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
      console.warn('Failed to update Monad Games ID after score submit:', e);
    }

    res.status(200).json({
      success: true,
      transactionHash: receipt.transactionHash,
      tokensEarned: tokensEarned,
      message: `Score submitted successfully! Earned ${tokensEarned} TURBO tokens.`
    });

  } catch (error) {
    console.error('Error submitting score:', error);
    
    // Handle specific error types
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return res.status(500).json({ 
        error: 'Server wallet has insufficient funds for gas fees' 
      });
    }
    
    if (error.code === 'NETWORK_ERROR') {
      return res.status(500).json({ 
        error: 'Blockchain network error. Please try again later.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to submit score. Please try again later.' 
    });
  }
}
