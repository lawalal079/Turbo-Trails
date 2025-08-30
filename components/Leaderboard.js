import { useState, useEffect } from 'react';

export default function Leaderboard({ onBackToMenu, currentWallet }) {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all-time'); // all-time, weekly, daily
  const [usernameMap, setUsernameMap] = useState({}); // walletLower -> username or null

  useEffect(() => {
    fetchLeaderboard();
  }, [timeFilter]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/leaderboard?filter=${timeFilter}`);
      const data = await response.json();
      const rows = data.leaderboard || [];
      setLeaderboardData(rows);
      // Kick off username resolution for rows missing username
      try {
        const toResolve = rows
          .map(p => (p?.wallet || '').toLowerCase())
          .filter(addr => addr && usernameMap[addr] === undefined);
        if (toResolve.length > 0) {
          // Resolve sequentially to be gentle; could be parallel if needed
          (async () => {
            const updates = {};
            for (const addr of toResolve) {
              try {
                const res = await fetch(`https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${addr}`);
                if (res.ok) {
                  const j = await res.json();
                  updates[addr] = (j?.hasUsername && j?.user?.username) ? String(j.user.username) : null;
                } else {
                  updates[addr] = null;
                }
              } catch {
                updates[addr] = null;
              }
            }
            if (Object.keys(updates).length) {
              setUsernameMap(prev => ({ ...prev, ...updates }));
            }
          })();
        }
      } catch {}
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const topFive = leaderboardData.slice(0, 5);
  const displayNameFor = (p) => (usernameMap[(p.wallet||'').toLowerCase()] ?? p.username) || 'Anonymous';

  // Compute "My Rank" and score
  const myAddrLower = (currentWallet || '').toLowerCase();
  const myIndex = leaderboardData.findIndex(p => (p?.wallet || '').toLowerCase() === myAddrLower);
  const myRank = myIndex >= 0 ? (myIndex + 1) : null;
  const myEntry = myIndex >= 0 ? leaderboardData[myIndex] : null;

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
    <>
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
                      <div className="player-name">{displayNameFor(player)}</div>
                      <div className="player-score">{formatScore(player.score)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* My Rank Card (moved below podium) */}
              <div className="my-rank-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', margin: '12px 0' }}>
                <div className="left">
                  <div className="player-name" style={{ fontWeight: 600 }}>
                    {myEntry
                      ? displayNameFor(myEntry)
                      : (currentWallet
                          ? (usernameMap[(currentWallet||'').toLowerCase()] ?? 'Anonymous')
                          : 'Not signed in')}
                  </div>
                </div>
                <div className="right" style={{ textAlign: 'right' }}>
                  <div><span style={{ opacity: 0.8 }}>Rank:</span> {myRank ? `#${myRank}` : '—'}</div>
                  <div><span style={{ opacity: 0.8 }}>Highest Score:</span> {myEntry ? formatScore(myEntry.score) : '—'}</div>
                </div>
              </div>

              {/* Full Rankings (Top 5 only) */}
              <div className="rankings-list">
                <div className="rankings-header">
                  <span className="rank-col">Rank</span>
                  <span className="player-col">Player</span>
                  <span className="score-col">Score</span>
                </div>
                
                {topFive.map((player, index) => (
                  <div
                    key={player.wallet}
                    className="ranking-row"
                  >
                    <span className="rank-col">
                      {getRankIcon(index + 1)}
                    </span>
                    <span className="player-col">
                      <div className="player-info">
                        <div className="player-name">
                          {displayNameFor(player)}
                        </div>
                        <div className="player-address">
                          {formatAddress(player.wallet)}
                        </div>
                      </div>
                    </span>
                    <span className="score-col">
                      {formatScore(player.score)}
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
    
    {/* Modals removed: using My Rank card instead */}
    </>
  );
}
