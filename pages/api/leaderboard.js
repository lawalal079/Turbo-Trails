import { ethers } from 'ethers';
import axios from 'axios';

// Monad Games ID contract ABI (simplified)
const MONAD_GAMES_ID_ABI = [
  "function getLeaderboard() external view returns (address[] memory players, uint256[] memory scores)",
  "function getPlayerScore(address player) external view returns (uint256)"
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filter = 'all-time' } = req.query;

    // Setup blockchain connection
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

    // Connect to Monad Games ID contract
    const monadGamesContract = new ethers.Contract(
      process.env.MONAD_GAMES_ID_CONTRACT,
      MONAD_GAMES_ID_ABI,
      provider
    );

    console.log('Fetching leaderboard data from blockchain...');

    // Get leaderboard data from contract
    const [players, scores] = await monadGamesContract.getLeaderboard();

    // Combine players and scores, then sort by score (descending)
    const leaderboardData = players.map((player, index) => ({
      wallet: player,
      score: parseInt(scores[index].toString()),
      tokensEarned: parseInt(scores[index].toString()) * 10
    })).sort((a, b) => b.score - a.score);

    // Fetch usernames for players
    const leaderboardWithUsernames = await Promise.all(
      leaderboardData.map(async (player) => {
        try {
          const response = await axios.get(
            `https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${player.wallet}`,
            { timeout: 5000 }
          );
          return {
            ...player,
            username: response.data.username || null
          };
        } catch (error) {
          console.warn(`Failed to fetch username for ${player.wallet}`);
          return {
            ...player,
            username: null
          };
        }
      })
    );

    // Apply time filter (for now, we'll return all data since we don't have timestamps)
    // In a production environment, you'd want to store timestamps and filter accordingly
    let filteredData = leaderboardWithUsernames;

    switch (filter) {
      case 'weekly':
        // For demo purposes, return top 50% of players
        filteredData = leaderboardWithUsernames.slice(0, Math.ceil(leaderboardWithUsernames.length / 2));
        break;
      case 'daily':
        // For demo purposes, return top 25% of players
        filteredData = leaderboardWithUsernames.slice(0, Math.ceil(leaderboardWithUsernames.length / 4));
        break;
      default:
        // all-time - return all data
        break;
    }

    res.status(200).json({
      success: true,
      leaderboard: filteredData,
      totalPlayers: filteredData.length,
      filter: filter
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    
    if (error.code === 'NETWORK_ERROR') {
      return res.status(500).json({ 
        error: 'Blockchain network error. Please try again later.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch leaderboard data',
      leaderboard: []
    });
  }
}
