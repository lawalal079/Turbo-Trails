// POST /api/client-submit-score
// Body: { wallet: string, score: number, distanceKm?: number }
// Purpose: Safe client-callable proxy that forwards to /api/submit-score using server API_SECRET

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { wallet, score, distanceKm } = req.body || {};
    if (!wallet || typeof score !== 'number') {
      return res.status(400).json({ error: 'Invalid wallet or score' });
    }
    if (score < 0 || score > 1_000_000) {
      return res.status(400).json({ error: 'Invalid score range' });
    }
    if (typeof distanceKm !== 'undefined') {
      if (typeof distanceKm !== 'number' || distanceKm < 0 || distanceKm > 10_000) {
        return res.status(400).json({ error: 'Invalid distanceKm' });
      }
    }

    // Build absolute same-origin URL from incoming request
    const proto = (req.headers['x-forwarded-proto'] || 'http');
    const host = req.headers.host;
    const baseUrl = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    const forwardResp = await fetch(`${baseUrl}/api/submit-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_SECRET || ''
      },
      body: JSON.stringify({ wallet, score, distanceKm })
    });

    const data = await forwardResp.json().catch(() => ({ ok: false, error: 'Invalid response from submit-score' }));
    return res.status(forwardResp.status).json(data);
  } catch (err) {
    console.error('client-submit-score error:', err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}
