import { ethers } from 'ethers';

// Monad Games ID contract ABI (only needed function)
const MONAD_GAMES_ID_ABI = [
  "function updatePlayerData(address player, uint256 scoreAmount, uint256 transactionAmount) external"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Basic auth: require API key header that only server-side calls will include
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Optional origin check
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL;
    const origin = req.headers.origin || '';
    if (allowedOrigin && origin && !origin.startsWith(allowedOrigin)) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }

    const { playerAddress, scoreAmount = 0, transactionAmount = 0 } = req.body || {};

    if (!playerAddress || !ethers.isAddress(playerAddress)) {
      return res.status(400).json({ error: 'Invalid playerAddress' });
    }

    if (scoreAmount < 0 || transactionAmount < 0) {
      return res.status(400).json({ error: 'Amounts must be non-negative' });
    }

    // Limits similar to mission example
    const MAX_SCORE_PER_REQUEST = 10000;
    const MAX_TRANSACTIONS_PER_REQUEST = 100;
    if (scoreAmount > MAX_SCORE_PER_REQUEST || transactionAmount > MAX_TRANSACTIONS_PER_REQUEST) {
      return res.status(400).json({ error: 'Amounts exceed allowed limits' });
    }

    // Setup signer for Monad Games ID
    const rpcUrl = process.env.RPC_URL; // reuse existing RPC_URL
    const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY; // prefer dedicated key
    const contractAddress = process.env.MONAD_GAMES_ID_CONTRACT_ADDRESS || process.env.MONAD_GAMES_ID_CONTRACT || '0xceCBFF203C8B6044F52CE23D914A1bfD997541A4';

    if (!rpcUrl || !privateKey) {
      return res.status(500).json({ error: 'Server configuration error: RPC_URL or WALLET_PRIVATE_KEY missing' });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const serverWallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, MONAD_GAMES_ID_ABI, serverWallet);

    const tx = await contract.updatePlayerData(
      playerAddress,
      ethers.toBigInt(scoreAmount),
      ethers.toBigInt(transactionAmount)
    );

    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      transactionHash: receipt.transactionHash,
      message: 'Player data updated on Monad Games ID'
    });
  } catch (error) {
    console.error('Error updating player data (Monad Games ID):', error);
    if (error && error.reason) {
      if (String(error.reason).includes('AccessControlUnauthorizedAccount')) {
        return res.status(403).json({ error: 'Server wallet lacks GAME_ROLE' });
      }
    }
    return res.status(500).json({ error: 'Failed to update player data' });
  }
}
