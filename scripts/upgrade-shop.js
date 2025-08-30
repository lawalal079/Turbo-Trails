const { ethers, upgrades } = require('hardhat');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const { NEXT_PUBLIC_SHOP } = process.env;
  if (!NEXT_PUBLIC_SHOP) throw new Error('NEXT_PUBLIC_SHOP is required');

  const Shop = await ethers.getContractFactory('Shop');
  console.log('Upgrading Shop proxy at', NEXT_PUBLIC_SHOP);
  const upgraded = await upgrades.upgradeProxy(NEXT_PUBLIC_SHOP, Shop);
  await upgraded.waitForDeployment();
  const impl = await upgrades.erc1967.getImplementationAddress(NEXT_PUBLIC_SHOP);
  console.log('Shop upgraded. New implementation:', impl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
