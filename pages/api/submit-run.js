// POST /api/submit-run
// Body: { playerAddress: string, scoreDelta: number|string, txDelta: number|string }
// Server-side submits deltas to Monad Games ID: updatePlayerData(player, scoreAmount, transactionAmount)

import { ethers } from 'ethers';

const ABI = [
  "function updatePlayerData(address player, uint256 scoreAmount, uint256 transactionAmount) external"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const { playerAddress, scoreDelta, txDelta } = req.body || {};
    if (!playerAddress || !ethers.isAddress(playerAddress)) {
      return res.status(400).json({ error: 'Invalid playerAddress' });
    }
    const scoreAmount = BigInt(scoreDelta ?? 0);
    const transactionAmount = BigInt(txDelta ?? 0);
    if (scoreAmount < 0n || transactionAmount < 0n) {
      return res.status(400).json({ error: 'Deltas must be non-negative' });
    }

    const RPC_URL = process.env.RPC_URL;
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const MONAD_GAMES_ID_CONTRACT = process.env.MONAD_GAMES_ID_CONTRACT || "0xceCBFF203C8B6044F52CE23D914A1bfD997541A4";

    if (!RPC_URL || !PRIVATE_KEY || !MONAD_GAMES_ID_CONTRACT) {
      return res.status(500).json({ error: 'Server misconfigured: RPC_URL/PRIVATE_KEY/MONAD_GAMES_ID_CONTRACT missing' });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(MONAD_GAMES_ID_CONTRACT, ABI, wallet);

    // IMPORTANT: send deltas (not totals)
    const tx = await contract.updatePlayerData(playerAddress, scoreAmount, transactionAmount);
    const receipt = await tx.wait();

    return res.status(200).json({
      ok: true,
      txHash: receipt?.hash || tx?.hash,
      player: playerAddress,
      scoreDelta: scoreAmount.toString(),
      txDelta: transactionAmount.toString(),
    });
  } catch (err) {
    console.error('submit-run error:', err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}
