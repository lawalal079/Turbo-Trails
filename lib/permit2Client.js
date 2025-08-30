// Client-side helper to build & sign Permit2 PermitTransferFrom and call backend
// ethers v6 is already in dependencies
import { ethers } from 'ethers';

export async function signPermit2AndBuy({
  provider, // EIP-1193 provider (e.g., window.ethereum)
  buyer,    // buyer address
  itemId,
  qty,
  itemPrice, // price per unit in wei (number or string)
  apiUrl = '/api/shop/buy',
}) {
  if (!provider) throw new Error('No provider');

  const PERMIT2 = process.env.NEXT_PUBLIC_PERMIT2_ADDRESS || process.env.PERMIT2_ADDRESS;
  const TURBO = process.env.NEXT_PUBLIC_TURBO_TOKEN;
  const SHOP = process.env.NEXT_PUBLIC_SHOP;
  if (!PERMIT2 || !TURBO || !SHOP) throw new Error('Missing PERMIT2/TURBO/SHOP env');

  const web3 = new ethers.BrowserProvider(provider);
  const signer = await web3.getSigner();
  const network = await web3.getNetwork();

  const total = BigInt(itemPrice) * BigInt(qty);
  const nonce = BigInt(Date.now()); // simple unique client nonce
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10); // 10 min

  const domain = {
    name: 'Permit2',
    version: '1',
    chainId: Number(network.chainId),
    verifyingContract: PERMIT2,
  };

  // ethers v6 signTypedData expects types WITHOUT EIP712Domain
  const types = {
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    // Uniswap Permit2 PermitTransferFrom has no 'spender' in the struct
    PermitTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const message = {
    permitted: { token: TURBO, amount: total.toString() },
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };

  // Sign typed data (ethers v6)
  const signature = await signer.signTypedData(domain, types, message);

  // Call backend API which will relay Shop.buyWithPermit2(...)
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ buyer, itemId, qty, nonce: nonce.toString(), deadline: deadline.toString(), signature }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }));
    const msg = [err.error, err.reason].filter(Boolean).join(': ');
    throw new Error(msg || 'Request failed');
  }
  return await resp.json();
}

// Build Permit2 typed data and payload without needing an ethers signer.
export function buildPermit2TypedDataAndBody({
  chainId,
  buyer,
  itemId,
  qty,
  itemPrice,
  exactTotal, // optional BigInt string to override total amount
}) {
  const PERMIT2 = process.env.NEXT_PUBLIC_PERMIT2_ADDRESS || process.env.PERMIT2_ADDRESS;
  const TURBO = process.env.NEXT_PUBLIC_TURBO_TOKEN;
  const SHOP = process.env.NEXT_PUBLIC_SHOP;
  if (!PERMIT2 || !TURBO || !SHOP) throw new Error('Missing PERMIT2/TURBO/SHOP env');

  const total = exactTotal !== undefined && exactTotal !== null
    ? BigInt(exactTotal)
    : (BigInt(itemPrice) * BigInt(qty));
  const nonce = BigInt(Date.now());
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);

  const domain = {
    name: 'Permit2',
    version: '1',
    chainId: Number(chainId),
    verifyingContract: PERMIT2,
  };
  const types = {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    PermitTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };
  const message = {
    permitted: { token: TURBO, amount: total.toString() },
    spender: SHOP,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };

  const body = {
    buyer,
    itemId,
    qty,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };

  return { domain, types, message, body, primaryType: 'PermitTransferFrom' };
}

// Helper to fetch exact on-chain total price for (itemId, qty)
export async function getOnchainTotal({ rpcUrl, shopAddress, itemId, qty }) {
  if (!rpcUrl) throw new Error('Missing rpcUrl');
  if (!shopAddress) throw new Error('Missing shopAddress');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  // public getter for mapping returns (price, burnBps, enabled, pvpUsable)
  const abi = ['function catalog(uint256) view returns (uint256,uint16,bool,bool)'];
  const shop = new ethers.Contract(shopAddress, abi, provider);
  const [price,, enabled,] = await shop.catalog(itemId);
  if (!enabled) throw new Error('item disabled');
  const total = BigInt(price) * BigInt(qty);
  return total.toString();
}

export async function postPermit2Buy({ apiUrl = '/api/shop/buy', body, signature }) {
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, signature }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }));
    const msg = [err.error, err.reason].filter(Boolean).join(': ');
    throw new Error(msg || 'Request failed');
  }
  return await resp.json();
}
