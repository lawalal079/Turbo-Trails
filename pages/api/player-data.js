import { ethers } from 'ethers';

// Contract ABIs
const TURBO_TOKEN_ABI = [
  "function balanceOf(address owner) external view returns (uint256)"
];

const GAME_INTERMEDIARY_ABI = [
  "function getPlayerInventory(address player) external view returns (uint256[] memory itemIds, uint256[] memory counts, bool[] memory permanentItems, uint256 bikeLevel)"
];

const MONAD_GAMES_ID_ABI = [
  "function getPlayerScore(address player) external view returns (uint256)"
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Setup blockchain connection
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

    // Connect to contracts
    const turboTokenContract = new ethers.Contract(
      process.env.TURBO_TOKEN_CONTRACT_ADDRESS,
      TURBO_TOKEN_ABI,
      provider
    );

    const intermediaryContract = new ethers.Contract(
      process.env.INTERMEDIARY_CONTRACT_ADDRESS,
      GAME_INTERMEDIARY_ABI,
      provider
    );

    const monadGamesContract = new ethers.Contract(
      process.env.MONAD_GAMES_ID_CONTRACT,
      MONAD_GAMES_ID_ABI,
      provider
    );

    console.log(`Fetching player data for wallet: ${wallet}`);

    // Fetch data in parallel
    const [turboBalance, inventory, bestScore] = await Promise.all([
      turboTokenContract.balanceOf(wallet),
      intermediaryContract.getPlayerInventory(wallet),
      monadGamesContract.getPlayerScore(wallet).catch(() => 0)
    ]);

    // Process inventory data
    const [itemIds, counts, permanentItems, bikeLevel] = inventory;
    const inventoryData = {};
    
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = parseInt(itemIds[i].toString());
      inventoryData[itemId] = {
        count: parseInt(counts[i].toString()),
        isPermanent: permanentItems[i]
      };
    }

    const playerData = {
      wallet: wallet,
      turboBalance: parseInt(ethers.formatEther(turboBalance)),
      bestScore: parseInt(bestScore.toString()),
      inventory: inventoryData,
      bikeLevel: parseInt(bikeLevel.toString()),
      // Calculate total items for quick reference
      totalItems: Object.values(inventoryData).reduce((sum, item) => sum + item.count, 0)
    };

    res.status(200).json({
      success: true,
      playerData: playerData
    });

  } catch (error) {
    console.error('Error fetching player data:', error);
    
    if (error.code === 'NETWORK_ERROR') {
      return res.status(500).json({ 
        error: 'Blockchain network error. Please try again later.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch player data',
      playerData: {
        wallet: req.query.wallet,
        turboBalance: 0,
        bestScore: 0,
        inventory: {},
        bikeLevel: 0,
        totalItems: 0
      }
    });
  }
}
