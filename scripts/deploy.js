// Hardhat deploy script for TurboToken and GameIntermediary
// Usage:
//   npx hardhat run scripts/deploy.js --network monadTestnet
// Env (from .env.local):
//   RPC_URL
//   PRIVATE_KEY
//   MONAD_GAMES_ID_CONTRACT (or MONAD_GAMES_ID_CONTRACT_ADDRESS)
//   TREASURY_ADDRESS (optional)
//   GAME_SERVER_ADDRESS (optional)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function main() {
  const hre = require('hardhat');
  const { ethers } = hre;

  const MONAD_GAMES_ID = process.env.MONAD_GAMES_ID_CONTRACT || process.env.MONAD_GAMES_ID_CONTRACT_ADDRESS;
  if (!MONAD_GAMES_ID) throw new Error('Set MONAD_GAMES_ID_CONTRACT in .env.local');

  console.log('Deployer:', (await ethers.getSigners())[0].address);

  // 1) Deploy TurboToken
  const TurboToken = await ethers.getContractFactory('TurboToken');
  console.log('Deploying TurboToken...');
  const token = await TurboToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log('TurboToken deployed at:', tokenAddress);

  // 2) Deploy GameIntermediary(_turboToken, _monadGamesID)
  const GameIntermediary = await ethers.getContractFactory('GameIntermediary');
  console.log('Deploying GameIntermediary...');
  const intermediary = await GameIntermediary.deploy(tokenAddress, MONAD_GAMES_ID);
  await intermediary.waitForDeployment();
  const intermediaryAddress = await intermediary.getAddress();
  console.log('GameIntermediary deployed at:', intermediaryAddress);

  // 3) Authorize Intermediary as minter on token
  console.log('Authorizing GameIntermediary as minter on TurboToken...');
  const addMinterTx = await token.addMinter(intermediaryAddress);
  console.log(' addMinter tx:', addMinterTx.hash);
  await addMinterTx.wait();

  // 4) Optional: set treasury
  if (process.env.TREASURY_ADDRESS) {
    console.log('Setting treasury to', process.env.TREASURY_ADDRESS);
    const tx = await intermediary.setTreasury(process.env.TREASURY_ADDRESS);
    console.log(' setTreasury tx:', tx.hash);
    await tx.wait();
  }

  // 5) Optional: set game server (EOA that can call submitScoreAndMintTokens/purchaseItemFor)
  if (process.env.GAME_SERVER_ADDRESS) {
    console.log('Setting gameServer to', process.env.GAME_SERVER_ADDRESS);
    const tx = await intermediary.setGameServer(process.env.GAME_SERVER_ADDRESS);
    console.log(' setGameServer tx:', tx.hash);
    await tx.wait();
  }

  console.log('\nDeployment complete');
  console.log('TurboToken:', tokenAddress);
  console.log('GameIntermediary:', intermediaryAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
