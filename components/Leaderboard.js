import { useState, useEffect } from 'react';

export default function Leaderboard({ onBackToMenu }) {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all-time'); // all-time, weekly, daily

  useEffect(() => {
    fetchLeaderboard();
  }, [timeFilter]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/leaderboard?filter=${timeFilter}`);
      const data = await response.json();
      setLeaderboardData(data.leaderboard || []);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatScore = (score) => {
    return score.toLocaleString();
  };

  const formatAddress = (address) => {
    if (!address) return 'Anonymous';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return `#${rank}`;
    }
  };

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <button className="back-button" onClick={onBackToMenu}>
          ← Back to Menu
        </button>
        <h1>🏆 LEADERBOARD</h1>
      </div>

      <div className="leaderboard-content">
        {/* Time Filter Tabs */}
        <div className="time-filters">
          <button
            className={`filter-tab ${timeFilter === 'all-time' ? 'active' : ''}`}
            onClick={() => setTimeFilter('all-time')}
          >
            All Time
          </button>
          <button
            className={`filter-tab ${timeFilter === 'weekly' ? 'active' : ''}`}
            onClick={() => setTimeFilter('weekly')}
          >
            This Week
          </button>
          <button
            className={`filter-tab ${timeFilter === 'daily' ? 'active' : ''}`}
            onClick={() => setTimeFilter('daily')}
          >
            Today
          </button>
        </div>

        {/* Leaderboard Table */}
        <div className="leaderboard-table">
          {loading ? (
            <div className="loading">Loading leaderboard...</div>
          ) : leaderboardData.length === 0 ? (
            <div className="no-data">No scores available yet. Be the first to play!</div>
          ) : (
            <>
              {/* Top 3 Podium */}
              <div className="podium">
                {leaderboardData.slice(0, 3).map((player, index) => (
                  <div key={player.wallet} className={`podium-place place-${index + 1}`}>
                    <div className="podium-rank">{getRankIcon(index + 1)}</div>
                    <div className="podium-player">
                      <div className="player-name">{player.username || formatAddress(player.wallet)}</div>
                      <div className="player-score">{formatScore(player.score)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Full Rankings */}
              <div className="rankings-list">
                <div className="rankings-header">
                  <span className="rank-col">Rank</span>
                  <span className="player-col">Player</span>
                  <span className="score-col">Score</span>
                  <span className="tokens-col">Tokens Earned</span>
                </div>
                
                {leaderboardData.map((player, index) => (
                  <div key={player.wallet} className="ranking-row">
                    <span className="rank-col">
                      {getRankIcon(index + 1)}
                    </span>
                    <span className="player-col">
                      <div className="player-info">
                        <div className="player-name">
                          {player.username || formatAddress(player.wallet)}
                        </div>
                        <div className="player-address">
                          {formatAddress(player.wallet)}
                        </div>
                      </div>
                    </span>
                    <span className="score-col">
                      {formatScore(player.score)}
                    </span>
                    <span className="tokens-col">
                      🪙 {formatScore(player.tokensEarned || player.score * 10)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Statistics */}
        <div className="leaderboard-stats">
          <div className="stat-card">
            <div className="stat-value">{leaderboardData.length}</div>
            <div className="stat-label">Total Players</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {leaderboardData.length > 0 ? formatScore(Math.max(...leaderboardData.map(p => p.score))) : '0'}
            </div>
            <div className="stat-label">Highest Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {leaderboardData.length > 0 
                ? formatScore(Math.floor(leaderboardData.reduce((sum, p) => sum + p.score, 0) / leaderboardData.length))
                : '0'
              }
            </div>
            <div className="stat-label">Average Score</div>
          </div>
        </div>
      </div>
    </div>
  );
}
