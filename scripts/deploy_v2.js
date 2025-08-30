// Deploy upgradeable TurboItems, Shop, PvPBet
// Requirements (install first):
//   npm i -D @openzeppelin/hardhat-upgrades @openzeppelin/contracts-upgradeable
// Env (.env.local):
//   RPC_URL
//   PRIVATE_KEY               // deployer (OWNER)
//   BACKEND_ADDRESS           // server EOA allowed for PvP settlement
//   TURBO_TOKEN_CONTRACT_ADDRESS
// Usage:
//   npx hardhat run scripts/deploy_v2.js --network monad

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function main() {
  console.log('Starting deployment script...');
  const hre = require('hardhat');
  const { ethers, upgrades } = hre;
  
  console.log('Hardhat network:', hre.network.name);
  console.log('RPC URL:', process.env.RPC_URL);
  console.log('Turbo Token Address:', process.env.TURBO_TOKEN_CONTRACT_ADDRESS);
  console.log('Backend Address:', process.env.BACKEND_ADDRESS);

  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const TURBO = process.env.TURBO_TOKEN_CONTRACT_ADDRESS;
  if (!TURBO) throw new Error('Set TURBO_TOKEN_CONTRACT_ADDRESS in .env.local');
  const BACKEND = process.env.BACKEND_ADDRESS || deployer.address;

  // 1) Deploy TurboItems proxy
  const TurboItems = await ethers.getContractFactory('TurboItems');
  console.log('Deploying TurboItems (proxy)...');
  const items = await upgrades.deployProxy(
    TurboItems,
    ["https://turbo-trails/items/{id}.json", deployer.address, ethers.ZeroAddress],
    { kind: 'uups' }
  );
  await items.waitForDeployment();
  const itemsAddr = await items.getAddress();
  console.log('TurboItems proxy at:', itemsAddr);

  // 2) Deploy Shop proxy
  const Shop = await ethers.getContractFactory('Shop');
  console.log('Deploying Shop (proxy)...');
  const shop = await upgrades.deployProxy(
    Shop,
    [TURBO, itemsAddr, deployer.address],
    { kind: 'uups' }
  );
  await shop.waitForDeployment();
  const shopAddr = await shop.getAddress();
  console.log('Shop proxy at:', shopAddr);

  // 3) Wire Items.shop = shop
  console.log('Setting TurboItems.shop -> Shop');
  const setShopTx = await items.setShop(shopAddr);
  await setShopTx.wait();

  // 4) Deploy PvPBet proxy
  const PvPBet = await ethers.getContractFactory('PvPBet');
  console.log('Deploying PvPBet (proxy)...');
  const pvp = await upgrades.deployProxy(
    PvPBet,
    [itemsAddr, BACKEND, deployer.address],
    { kind: 'uups' }
  );
  await pvp.waitForDeployment();
  const pvpAddr = await pvp.getAddress();
  console.log('PvPBet proxy at:', pvpAddr);

  // 5) Initialize 8 items (placeholder prices) in Shop
  // id 1: Nitro (pvpUsable), id 2: BubbleShield (pvpUsable)
  const price = (n) => ethers.parseUnits(String(n), 18);
  const itemsInit = [
    { id: 1, price: price(5), pvp: true },
    { id: 2, price: price(8), pvp: true },
    { id: 3, price: price(3), pvp: false },
    { id: 4, price: price(4), pvp: false },
    { id: 5, price: price(6), pvp: false },
    { id: 6, price: price(7), pvp: false },
    { id: 7, price: price(9), pvp: false },
    { id: 8, price: price(10), pvp: false },
  ];
  console.log('Configuring 8 shop items (burn=100%)...');
  for (const it of itemsInit) {
    const tx = await shop.setItem(it.id, it.price, 10000, true, it.pvp);
    await tx.wait();
  }

  console.log('\nDeployment complete');
  console.log('TurboItems:', itemsAddr);
  console.log('Shop:', shopAddr);
  console.log('PvPBet:', pvpAddr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
