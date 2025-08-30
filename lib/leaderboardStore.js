import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'leaderboard.json');

// Detect if Vercel KV is configured (either URL means the SDK can talk to Redis)
const hasKV = !!(process.env.KV_URL || process.env.KV_REST_API_URL);

// KV key helpers
const Z_ALL = 'lb:z:all'; // sorted set of wallets by bestScore (desc)
const PLAYER_KEY = (walletLower) => `lb:player:${walletLower}`; // hash per player

// Lazy-load the KV client only if env suggests it exists, and only when needed.
let cachedKv = null;
async function getKv() {
  if (!hasKV) return null;
  if (cachedKv) return cachedKv;
  try {
    // Avoid webpack/Next static analysis: use eval('require') so local dev works without the package.
    const req = eval('require');
    const mod = req('@vercel/kv');
    cachedKv = mod.kv;
    return cachedKv;
  } catch (_) {
    // Fallback attempt using dynamic import with non-literal to avoid bundling
    try {
      const name = ['@vercel', 'kv'].join('/');
      const mod = await import(name);
      cachedKv = mod.kv;
      return cachedKv;
    } catch {
      return null;
    }
  }
}

async function ensureFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(FILE_PATH).catch(async () => {
      await fs.writeFile(FILE_PATH, JSON.stringify({ players: {} }, null, 2), 'utf8');
    });
  } catch (_) {}
}

export async function getAll() {
  if (hasKV) {
    try {
      // Read all wallets from the ZSET, then fetch each player hash
      const kv = await getKv();
      if (!kv) throw new Error('KV client unavailable');
      const wallets = await kv.zrange(Z_ALL, 0, -1);
      const entries = await Promise.all(
        wallets.map(async (w) => {
          const key = PLAYER_KEY(String(w).toLowerCase());
          const h = await kv.hgetall(key);
          return h || null;
        })
      );
      const players = {};
      for (const p of entries) {
        if (!p || !p.wallet) continue;
        const lower = String(p.wallet).toLowerCase();
        players[lower] = {
          wallet: p.wallet,
          username: p.username ?? null,
          bestScore: Number(p.bestScore || 0),
          totalTokens: Number(p.totalTokens || 0),
          lastRunAt: Number(p.lastRunAt || 0),
        };
      }
      return { players };
    } catch (e) {
      // Fallback to file if KV has any issue
    }
  }

  await ensureFile();
  const raw = await fs.readFile(FILE_PATH, 'utf8').catch(() => '{"players":{}}');
  let data;
  try { data = JSON.parse(raw || '{"players":{}}'); } catch { data = { players: {} }; }
  if (!data || typeof data !== 'object') data = { players: {} };
  if (!data.players || typeof data.players !== 'object') data.players = {};
  return data;
}

export async function upsertScore({ wallet, username, score, tokensEarned }) {
  if (!wallet) return;
  const keyLower = wallet.toLowerCase();
  const now = Date.now();

  if (hasKV) {
    // KV path
    const kv = await getKv();
    if (kv) {
      const pk = PLAYER_KEY(keyLower);
      const prev = (await kv.hgetall(pk)) || {};
      const incoming = Number(score || 0);
      const prevBest = Number(prev.bestScore || 0);
      const bestScore = Math.max(prevBest, incoming);
      const isNewBest = incoming > prevBest;
      const totalTokens = Number(prev.totalTokens || 0) + Number(tokensEarned || 0);

      // Write hash (only advance lastRunAt when new best is achieved)
      await kv.hset(pk, {
        wallet,
        username: username || prev.username || null,
        bestScore,
        totalTokens,
        lastRunAt: isNewBest ? now : Number(prev.lastRunAt || 0),
      });
      // Update sorted set for ranking
      await kv.zadd(Z_ALL, { score: bestScore, member: keyLower });

      return {
        wallet,
        username: username || prev.username || null,
        bestScore,
        totalTokens,
        lastRunAt: isNewBest ? now : Number(prev.lastRunAt || 0),
      };
    }
  }

  // File fallback (local dev)
  await ensureFile();
  const data = await getAll();
  const prev = data.players[keyLower] || {};
  const incoming = Number(score || 0);
  const prevBest = Number(prev.bestScore || 0);
  const bestScore = Math.max(prevBest, incoming);
  const isNewBest = incoming > prevBest;
  const totalTokens = Number(prev.totalTokens || 0) + Number(tokensEarned || 0);
  data.players[keyLower] = {
    wallet,
    username: username || prev.username || null,
    bestScore,
    totalTokens,
    lastRunAt: isNewBest ? now : Number(prev.lastRunAt || 0),
  };
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  return data.players[keyLower];
}

export async function toArraySorted(filter = 'all-time') {
  if (hasKV) {
    // Read IDs in rank order from ZSET, then filter by time window
    const kv = await getKv();
    if (kv) {
      const ids = await kv.zrevrange(Z_ALL, 0, -1); // high score -> low
      const records = await Promise.all(
        ids.map(async (id) => {
          const h = await kv.hgetall(PLAYER_KEY(String(id)));
          return h || null;
        })
      );
      const now = Date.now();
      const filtered = records.filter(Boolean).filter((p) => {
        const last = Number(p.lastRunAt || 0);
        if (filter === 'daily') {
          return now - last <= 24 * 60 * 60 * 1000;
        } else if (filter === 'weekly') {
          return now - last <= 7 * 24 * 60 * 60 * 1000;
        }
        return true;
      });
      // Already mostly ordered by bestScore; enforce sort in case of stale ZSET
      filtered.sort((a, b) => Number(b.bestScore || 0) - Number(a.bestScore || 0));
      return filtered.map((p) => ({
        wallet: p.wallet,
        username: p.username ?? null,
        score: Number(p.bestScore || 0),
        tokensEarned: Number(p.totalTokens || 0),
      }));
    }
  }

  // File fallback
  const data = await getAll();
  let arr = Object.values(data.players || {});
  const now = Date.now();
  if (filter === 'daily') {
    const dayMs = 24 * 60 * 60 * 1000;
    arr = arr.filter(p => now - (p.lastRunAt || 0) <= dayMs);
  } else if (filter === 'weekly') {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    arr = arr.filter(p => now - (p.lastRunAt || 0) <= weekMs);
  }
  arr.sort((a, b) => Number(b.bestScore || 0) - Number(a.bestScore || 0));
  return arr.map(p => ({
    wallet: p.wallet,
    username: p.username,
    score: Number(p.bestScore || 0),
    tokensEarned: Number(p.totalTokens || 0)
  }));
}
