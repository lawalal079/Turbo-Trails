import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const {
    RPC_URL,
    NEXT_PUBLIC_SHOP,
    NEXT_PUBLIC_TURBO_TOKEN,
    NEXT_PUBLIC_PERMIT2_ADDRESS,
    PERMIT2_ADDRESS,
  } = process.env;

  if (!RPC_URL || !NEXT_PUBLIC_SHOP) {
    console.error('Missing RPC_URL or NEXT_PUBLIC_SHOP');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const { chainId } = await provider.getNetwork();

  const shopAbi = [
    'function turbo() public view returns (address)',
    'function permit2() public view returns (address)',
    'function backend() public view returns (address)'
  ];
  const shop = new ethers.Contract(NEXT_PUBLIC_SHOP, shopAbi, provider);

  const [onchainTurbo, onchainPermit2, backend] = await Promise.all([
    shop.turbo(),
    shop.permit2(),
    shop.backend(),
  ]);

  const envPermit2 = NEXT_PUBLIC_PERMIT2_ADDRESS || PERMIT2_ADDRESS || 'Not set';

  console.log('--- Shop Config Check ---');
  console.log('Chain ID:', Number(chainId));
  console.log('Shop:', NEXT_PUBLIC_SHOP);
  console.log('Turbo (on-chain):', onchainTurbo);
  console.log('Turbo (env):', NEXT_PUBLIC_TURBO_TOKEN || 'Not set');
  console.log('Permit2 (on-chain):', onchainPermit2);
  console.log('Permit2 (env):', envPermit2);
  console.log('Backend (on-chain):', backend);

  if (envPermit2 && envPermit2 !== 'Not set') {
    try {
      const permit2Abi = ['function DOMAIN_SEPARATOR() external view returns (bytes32)'];
      const p2 = new ethers.Contract(envPermit2, permit2Abi, provider);
      const sep = await p2.DOMAIN_SEPARATOR();
      console.log('Permit2 DOMAIN_SEPARATOR:', sep);
    } catch (e) {
      console.warn('Failed to read Permit2.DOMAIN_SEPARATOR at env address:', e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
