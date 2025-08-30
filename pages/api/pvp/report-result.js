import { ethers } from 'ethers';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = req.headers['x-api-key'];
    const { API_SECRET, RPC_URL, SERVER_PRIVATE_KEY, NEXT_PUBLIC_PVP_BET } = process.env;

    if (!API_SECRET || !RPC_URL || !SERVER_PRIVATE_KEY || !NEXT_PUBLIC_PVP_BET) {
      return res.status(500).json({ error: 'Server env not configured' });
    }

    if (apiKey !== API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { roomId, winner } = (typeof req.body === 'string') ? JSON.parse(req.body) : req.body;
    if (!roomId || !winner) {
      return res.status(400).json({ error: 'Missing roomId or winner' });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(SERVER_PRIVATE_KEY, provider);

    const pvpAbi = [
      'function reportResult(bytes32 roomId, address winner) external'
    ];

    const pvpBet = new ethers.Contract(NEXT_PUBLIC_PVP_BET, pvpAbi, wallet);

    // roomId expected as 0x...32 bytes hex string
    const tx = await pvpBet.reportResult(roomId, winner);
    const receipt = await tx.wait();

    return res.status(200).json({ hash: tx.hash, status: receipt.status });
  } catch (err) {
    console.error('pvp/report-result error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
