import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'leaderboard.json');

async function ensureFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(FILE_PATH).catch(async () => {
      await fs.writeFile(FILE_PATH, JSON.stringify({ players: {} }, null, 2), 'utf8');
    });
  } catch (_) {}
}

export async function getAll() {
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
  await ensureFile();
  const data = await getAll();
  const key = wallet.toLowerCase();
  const now = Date.now();
  const prev = data.players[key] || {};
  const bestScore = Math.max(Number(prev.bestScore || 0), Number(score || 0));
  const totalTokens = Number(prev.totalTokens || 0) + Number(tokensEarned || 0);
  data.players[key] = {
    wallet,
    username: username || prev.username || null,
    bestScore,
    totalTokens,
    lastRunAt: now,
  };
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  return data.players[key];
}

export async function toArraySorted(filter = 'all-time') {
  const data = await getAll();
  let arr = Object.values(data.players || {});
  // Simple filter approximations using lastRunAt; real impl would bucket by day/week
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
