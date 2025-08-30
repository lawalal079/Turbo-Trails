import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const {
    RPC_URL,
    PRIVATE_KEY,
    BACKEND_ADDRESS,
    NEXT_PUBLIC_PVP_BET,
    NEXT_PUBLIC_SHOP,
  } = process.env;

  if (!RPC_URL || !PRIVATE_KEY || !BACKEND_ADDRESS) {
    throw new Error('Missing RPC_URL, PRIVATE_KEY, or BACKEND_ADDRESS');
  }
  if (!NEXT_PUBLIC_PVP_BET && !NEXT_PUBLIC_SHOP) {
    throw new Error('Provide NEXT_PUBLIC_PVP_BET and/or NEXT_PUBLIC_SHOP');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  const setBackendAbi = [
    'function setBackend(address backend_) external'
  ];

  if (NEXT_PUBLIC_PVP_BET) {
    const pvp = new ethers.Contract(NEXT_PUBLIC_PVP_BET, setBackendAbi, signer);
    const tx = await pvp.setBackend(BACKEND_ADDRESS);
    console.log('PvPBet.setBackend tx:', tx.hash);
    await tx.wait();
    console.log('PvPBet backend set to', BACKEND_ADDRESS);
  }

  if (NEXT_PUBLIC_SHOP) {
    const shop = new ethers.Contract(NEXT_PUBLIC_SHOP, setBackendAbi, signer);
    const tx2 = await shop.setBackend(BACKEND_ADDRESS);
    console.log('Shop.setBackend tx:', tx2.hash);
    await tx2.wait();
    console.log('Shop backend set to', BACKEND_ADDRESS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
