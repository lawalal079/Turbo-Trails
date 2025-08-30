import Head from 'next/head';
import Link from 'next/link';
import Leaderboard from '../components/Leaderboard';

export default function LeaderboardPage() {
  return (
    <div className="app-container">
      <Head>
        <title>Turbo Trails • Leaderboard</title>
        <meta name="robots" content="index,follow" />
      </Head>

      <div style={{ padding: '16px' }}>
        <Link href="/" legacyBehavior>
          <a className="back-button">← Back to Menu</a>
        </Link>
      </div>

      <Leaderboard onBackToMenu={() => { /* noop on standalone page; link above handles navigation */ }} />
    </div>
  );
}
