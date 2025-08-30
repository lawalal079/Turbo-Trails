import { ethers } from 'ethers';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = req.headers['x-api-key'];
    const { API_SECRET, RPC_URL, NEXT_PUBLIC_SHOP } = process.env;
    const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY || process.env.PRIVATE_KEY;

    if (!RPC_URL || !SERVER_PRIVATE_KEY || !NEXT_PUBLIC_SHOP) {
      return res.status(500).json({ error: 'Server env not configured', details: {
        RPC_URL: !!RPC_URL, SERVER_PRIVATE_KEY: !!SERVER_PRIVATE_KEY, NEXT_PUBLIC_SHOP: !!NEXT_PUBLIC_SHOP
      }});
    }

    // Auth: accept either valid API key or same-origin browser request
    if (API_SECRET && apiKey !== API_SECRET) {
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const referer = req.headers.referer || '';
      const originOk = typeof referer === 'string' && referer.includes(host);
      if (!originOk) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const body = (typeof req.body === 'string') ? JSON.parse(req.body) : req.body;
    let { buyer, itemId, qty, nonce, deadline, signature } = body || {};
    if (!buyer || !itemId || !qty) {
      return res.status(400).json({ error: 'Missing buyer, itemId or qty' });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(SERVER_PRIVATE_KEY, provider);

    // Support Permit2 flow when signature, nonce, deadline are present
    const shopAbi = [
      'function buyWithPermit2(address buyer, uint256 itemId, uint256 qty, uint256 nonce, uint256 deadline, bytes signature) external',
      'function buyFor(address buyer, uint256 itemId, uint256 qty) external',
      'function catalog(uint256) view returns (uint256 price, uint16 burnBps, bool enabled, bool pvpUsable)',
      'function turbo() view returns (address)',
      'function permit2() view returns (address)'
    ];
    const shop = new ethers.Contract(NEXT_PUBLIC_SHOP, shopAbi, wallet);

    // Hoisted vars for debug in case prevalidation partially fails
    let total; // string (wei)
    let TURBO; // address
    let PERMIT2; // address
    let SHOP_ADDR = NEXT_PUBLIC_SHOP; // address

    let tx;
    if (signature && deadline !== undefined && nonce !== undefined) {
      // Server-side prevalidation: recover signer from typed data and compare to buyer
      try {
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);

        // Read on-chain price to compute exact total
        const catalog = await shop.catalog(BigInt(itemId));
        const price = catalog[0]; // uint256 price
        const enabled = catalog[2];
        if (!enabled) return res.status(400).json({ error: 'Item disabled' });
        const total = (BigInt(price) * BigInt(qty)).toString();

        TURBO = await shop.turbo();
        PERMIT2 = process.env.NEXT_PUBLIC_PERMIT2_ADDRESS;
        SHOP_ADDR = NEXT_PUBLIC_SHOP;
        if (!PERMIT2) return res.status(500).json({ error: 'Server env not configured', details: { NEXT_PUBLIC_PERMIT2_ADDRESS: !!PERMIT2 } });

        // Sanity: check Permit2 code exists on chain
        try {
          const code = await provider.getCode(PERMIT2);
          if (!code || code === '0x') {
            return res.status(500).json({ error: 'Permit2 address has no code on chain', details: { PERMIT2, chainId } });
          }
        } catch {}

        // Sanity: shop.permit2 must match env PERMIT2
        try {
          const onchainP2 = await shop.permit2();
          if (!onchainP2 || onchainP2.toLowerCase() !== PERMIT2.toLowerCase()) {
            return res.status(500).json({ error: 'Shop.permit2 mismatch', details: { expected: PERMIT2, onchain: onchainP2 } });
          }
        } catch {}

        const domain = { name: 'Permit2', version: '1', chainId, verifyingContract: PERMIT2 };
        const types = {
          TokenPermissions: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          // Uniswap Permit2 PermitTransferFrom has no 'spender'
          PermitTransferFrom: [
            { name: 'permitted', type: 'TokenPermissions' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        };
        const message = {
          permitted: { token: TURBO, amount: total },
          nonce: nonce.toString(),
          deadline: deadline.toString(),
        };
        const recovered = ethers.verifyTypedData(domain, types, message, signature);
        if (recovered.toLowerCase() !== String(buyer).toLowerCase()) {
          console.warn('buyer != recovered, overriding buyer to recovered');
          buyer = recovered; // ensure on-chain owner matches signature signer
        }

        // Pre-check buyer TURBO balance to avoid on-chain revert
        try {
          const erc20 = new ethers.Contract(TURBO, ['function balanceOf(address) view returns (uint256)'], provider);
          const bal = await erc20.balanceOf(buyer);
          if (BigInt(bal) < BigInt(total)) {
            return res.status(400).json({
              error: 'Insufficient balance',
              reason: 'Buyer TURBO balance < total required',
              required: total,
              balance: bal.toString(),
              debug: {
                buyer,
                recovered,
                token: TURBO,
                shop: SHOP_ADDR,
                permit2: PERMIT2,
                chainId,
                itemId: String(itemId),
                qty: String(qty),
                nonce: String(nonce),
                deadline: String(deadline),
              }
            });
          }
        } catch {}
      } catch (e) {
        console.warn('Prevalidation failed, proceeding to tx', e?.message || e);
      }

      // Try static call first to capture precise revert reason
      try {
        await shop.buyWithPermit2.staticCall(buyer, BigInt(itemId), BigInt(qty), BigInt(nonce), BigInt(deadline), signature);
      } catch (simErr) {
        const msg = simErr?.reason || simErr?.shortMessage || simErr?.message || 'Simulation failed';
        const network = await provider.getNetwork();
        const chainId2 = Number(network.chainId);
        const block = await provider.getBlock('latest').catch(() => null);
        const blockTs = block?.timestamp ? Number(block.timestamp) : undefined;
        return res.status(400).json({
          error: 'Simulation failed',
          reason: msg,
          code: simErr?.code,
          data: simErr?.data,
          debug: {
            buyer,
            itemId: String(itemId),
            qty: String(qty),
            total,
            token: TURBO,
            shop: SHOP_ADDR,
            permit2: PERMIT2,
            chainId: chainId2,
            nonce: String(nonce),
            deadline: String(deadline),
            blockTimestamp: blockTs,
          }
        });
      }

      tx = await shop.buyWithPermit2(buyer, BigInt(itemId), BigInt(qty), BigInt(nonce), BigInt(deadline), signature);
    } else {
      // Fallback to backend-relayed buyFor (requires user's prior ERC20 approval)
      tx = await shop.buyFor(buyer, BigInt(itemId), BigInt(qty));
    }

    // Return immediately to avoid serverless/API timeouts; client can poll if needed
    return res.status(200).json({ hash: tx.hash, status: 'submitted' });
  } catch (err) {
    const msg = err?.reason || err?.shortMessage || err?.message || 'Unknown error';
    console.error('shop/buy error:', msg);
    // Try to include revert data if present
    const code = err?.code || 'UNKNOWN_ERROR';
    return res.status(500).json({ error: 'Internal server error', reason: msg, code });
  }
}
