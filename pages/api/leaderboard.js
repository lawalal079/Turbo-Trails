import { toArraySorted } from '../../lib/leaderboardStore';

// Career mode leaderboard - persistent JSON store (best score per wallet)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filter = 'all-time' } = req.query;

    const entries = await toArraySorted(String(filter || 'all-time'));
    res.status(200).json({
      success: true,
      leaderboard: entries,
      totalPlayers: entries.length,
      filter: String(filter || 'all-time')
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);

    res.status(500).json({ 
      error: 'Failed to fetch leaderboard data',
      leaderboard: []
    });
  }
}
