import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { RPC_URL, PRIVATE_KEY, NEXT_PUBLIC_SHOP, PERMIT2_ADDRESS } = process.env;
  if (!RPC_URL || !PRIVATE_KEY || !NEXT_PUBLIC_SHOP || !PERMIT2_ADDRESS) {
    throw new Error('Missing RPC_URL, PRIVATE_KEY, NEXT_PUBLIC_SHOP, or PERMIT2_ADDRESS');
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  const abi = [
    'function setPermit2(address permit2_) external'
  ];

  const shop = new ethers.Contract(NEXT_PUBLIC_SHOP, abi, signer);
  const tx = await shop.setPermit2(PERMIT2_ADDRESS);
  console.log('Shop.setPermit2 tx:', tx.hash);
  await tx.wait();
  console.log('Shop permit2 set to', PERMIT2_ADDRESS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
