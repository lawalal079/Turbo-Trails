import { ethers } from 'ethers';

// Game Intermediary contract ABI
const GAME_INTERMEDIARY_ABI = [
  "function purchaseItem(uint256 itemId, uint256 quantity) external",
  "function purchaseItemFor(address player, uint256 itemId, uint256 quantity) external"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerAddress, wallet, itemId, quantity = 1 } = req.body;

    const player = playerAddress || wallet;

    if (!player || !itemId) {
      return res.status(400).json({ error: 'playerAddress (or wallet) and itemId are required' });
    }

    if (!ethers.isAddress(player)) {
      return res.status(400).json({ error: 'Invalid player address' });
    }

    if (quantity < 1 || quantity > 100) {
      return res.status(400).json({ error: 'Invalid quantity' });
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

    console.log(`Processing gasless purchase: Item ${itemId}, Qty ${quantity} for player ${player}`);

    // Execute gasless purchase (burns from treasury and credits the player)
    const tx = await intermediaryContract.purchaseItemFor(player, itemId, quantity);
    const receipt = await tx.wait();

    console.log(`Gasless purchase successful: ${receipt.transactionHash}`);

    // Backend-only: reflect this purchase in Monad Games ID via secured internal call
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await fetch(`${baseUrl}/api/update-player-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_SECRET || ''
        },
        body: JSON.stringify({
          playerAddress: player,
          scoreAmount: 0,
          transactionAmount: Number(quantity) || 1
        })
      });
    } catch (e) {
      console.warn('Failed to update Monad Games ID after purchase:', e);
    }

    res.status(200).json({
      success: true,
      transactionHash: receipt.transactionHash,
      message: `Successfully purchased item ${itemId} for ${player}!`
    });

  } catch (error) {
    console.error('Error processing purchase:', error);
    
    // Handle specific error types
    if (error.reason) {
      // Contract revert reasons
      if (error.reason.includes('Insufficient TURBO tokens')) {
        return res.status(400).json({ 
          error: 'Insufficient TURBO tokens for this purchase' 
        });
      }
      if (error.reason.includes('Item not available')) {
        return res.status(400).json({ 
          error: 'This item is currently not available' 
        });
      }
      if (error.reason.includes('Treasury not set')) {
        return res.status(500).json({ 
          error: 'Server misconfiguration: Treasury address not set on contract' 
        });
      }
      if (error.reason.includes('Treasury insufficient TURBO')) {
        return res.status(400).json({ 
          error: 'Treasury has insufficient TURBO for this purchase' 
        });
      }
      if (error.reason.includes('Treasury allowance too low')) {
        return res.status(400).json({ 
          error: 'Treasury approval missing or too low. Ask admin to approve spending.' 
        });
      }
    }
    
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
      error: 'Failed to process purchase. Please try again later.' 
    });
  }
}
