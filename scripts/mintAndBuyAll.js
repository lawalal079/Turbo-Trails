  // Treasury flow helpers
async function runTreasuryFlow(args, { provider, token, intermediary, decimals, INTERMEDIARY_CONTRACT_ADDRESS }) {
  if (!args.treasury) return;
  const treasuryAddr = args.treasury;
  if (!ethers.isAddress(treasuryAddr)) {
    throw new Error('Invalid --treasury address');
  }

  // Optionally set treasury on the intermediary
  if (args.setTreasury) {
    try {
      console.log(`Setting GameIntermediary.treasury = ${treasuryAddr} ...`);
      const tx = await intermediary.setTreasury(treasuryAddr);
      console.log(' setTreasury tx:', tx.hash);
      await tx.wait();
    } catch (e) {
      console.warn('setTreasury failed (are you the contract owner?):', e.message || e);
    }
  }

  // Optionally ownerMint to treasury
  if (args.treasuryMint) {
    try {
      const amt = ethers.parseUnits(String(args.treasuryMint), decimals);
      console.log(`Minting ${args.treasuryMint} TURBO to treasury ${treasuryAddr} ...`);
      const tx = await token.ownerMint(treasuryAddr, amt);
      console.log(' ownerMint (treasury) tx:', tx.hash);
      await tx.wait();
    } catch (e) {
      console.warn('ownerMint to treasury failed (are you the token owner?):', e.message || e);
    }
  }

  // Optionally approve intermediary from the treasury signer
  if (args.treasuryApprove) {
    const tpk = process.env.TREASURY_PRIVATE_KEY;
    if (!tpk) {
      console.warn('TREASURY_PRIVATE_KEY not set in .env.local; cannot sign approve from treasury. Skipping.');
    } else {
      const treasurySigner = new ethers.Wallet(tpk, provider);
      if (treasurySigner.address.toLowerCase() !== treasuryAddr.toLowerCase()) {
        console.warn(`Warning: TREASURY_PRIVATE_KEY (${treasurySigner.address}) does not match --treasury address (${treasuryAddr}).`);
      }
      const tokenAsTreasury = token.connect(treasurySigner);
      const approveAmount = String(args.treasuryApprove).toLowerCase() === 'max'
        ? ethers.MaxUint256
        : ethers.parseUnits(String(args.treasuryApprove), decimals);
      console.log(`Approving GameIntermediary (${INTERMEDIARY_CONTRACT_ADDRESS}) to spend ${args.treasuryApprove} from treasury...`);
      const tx = await tokenAsTreasury.approve(INTERMEDIARY_CONTRACT_ADDRESS, approveAmount);
      console.log(' approve (treasury) tx:', tx.hash);
      await tx.wait();
    }
  }
}

/*
 Usage:
   node scripts/mintAndBuyAll.js [--mint 1000000] [--buy-all] [--airdrop recipients.json] [--transfer 0xTo 5000] [--treasury 0xAddr --set-treasury --treasury-mint 500000 --treasury-approve max]

 Modes:
   - Default (no flags): Owner mints specified amount and HOLDs. No purchases.
   - --buy-all: After mint, approve intermediary and buy all active items (consumables x5, others x1).
   - --airdrop <file>: JSON array of { address, amount } to transfer TURBO to after mint.
   - --transfer <to> <amount>: Single recipient quick transfer after mint.
   - --treasury <addr>: Treasury flow helpers. Optional sub-flags:
       • --set-treasury: Set GameIntermediary.treasury to <addr> (owner-only)
       • --treasury-mint <amount>: ownerMint TURBO to <addr>
       • --treasury-approve <amount|max>: approve GameIntermediary from treasury signer (needs TREASURY_PRIVATE_KEY)

 Notes:
   - Mint uses owner-only ownerMint(); must run with token owner's PRIVATE_KEY.
   - Amounts are in whole TURBO (script will apply decimals from token).
   - Requires .env.local with: PRIVATE_KEY, RPC_URL, INTERMEDIARY_CONTRACT_ADDRESS, TURBO_TOKEN_CONTRACT_ADDRESS
   - For treasury approve: set TREASURY_PRIVATE_KEY in .env.local to the treasury's key.
   - Ensure contracts are compiled (contracts/artifacts/*.json exist).
*/
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function loadArtifact(name) {
  const artifactPath = path.join(__dirname, '..', 'contracts', 'artifacts', `${name}.json`);
  const raw = fs.readFileSync(artifactPath, 'utf8');
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const args = { mint: '1000000', buyAll: false, airdrop: null, transfer: null, treasury: null, setTreasury: false, treasuryMint: null, treasuryApprove: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mint') {
      args.mint = argv[++i];
    } else if (a === '--buy-all') {
      args.buyAll = true;
    } else if (a === '--airdrop') {
      args.airdrop = argv[++i];
    } else if (a === '--transfer') {
      const to = argv[++i];
      const amount = argv[++i];
      args.transfer = { to, amount };
    } else if (a === '--treasury') {
      args.treasury = argv[++i];
    } else if (a === '--set-treasury') {
      args.setTreasury = true;
    } else if (a === '--treasury-mint') {
      args.treasuryMint = argv[++i];
    } else if (a === '--treasury-approve') {
      args.treasuryApprove = argv[++i]; // number or 'max'
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const {
    PRIVATE_KEY,
    RPC_URL,
    INTERMEDIARY_CONTRACT_ADDRESS,
    TURBO_TOKEN_CONTRACT_ADDRESS,
  } = process.env;

  if (!PRIVATE_KEY || !RPC_URL || !INTERMEDIARY_CONTRACT_ADDRESS || !TURBO_TOKEN_CONTRACT_ADDRESS) {
    throw new Error('Missing env vars. Set PRIVATE_KEY, RPC_URL, INTERMEDIARY_CONTRACT_ADDRESS, TURBO_TOKEN_CONTRACT_ADDRESS in .env.local');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log('Using wallet:', wallet.address);

  const tokenArtifact = await loadArtifact('TurboToken');
  const intermediaryArtifact = await loadArtifact('GameIntermediary');

  const token = new ethers.Contract(TURBO_TOKEN_CONTRACT_ADDRESS, tokenArtifact.abi, wallet);
  const intermediary = new ethers.Contract(INTERMEDIARY_CONTRACT_ADDRESS, intermediaryArtifact.abi, wallet);

  const decimals = await token.decimals();
  const mintAmount = ethers.parseUnits(String(args.mint), decimals);

  // Ensure intermediary is an authorized minter (for score rewards later)
  try {
    const isMinter = await token.authorizedMinters(INTERMEDIARY_CONTRACT_ADDRESS);
    if (!isMinter) {
      console.log('Authorizing GameIntermediary as minter...');
      const tx = await token.addMinter(INTERMEDIARY_CONTRACT_ADDRESS);
      console.log(' addMinter tx:', tx.hash);
      await tx.wait();
    } else {
      console.log('GameIntermediary already authorized as minter');
    }
  } catch (e) {
    console.warn('Could not verify/add minter (are you the token owner?):', e.message || e);
  }

  // Mint tokens to self (owner-only function)
  console.log(`Minting ${args.mint} TURBO to owner for testing/holding...`);
  const mintTx = await token.ownerMint(wallet.address, mintAmount);
  console.log(' ownerMint tx:', mintTx.hash);
  await mintTx.wait();

  let bal = await token.balanceOf(wallet.address);
  console.log(' Owner balance TURBO:', ethers.formatUnits(bal, decimals));

  // Treasury flow (optional)
  await runTreasuryFlow(args, { provider, token, intermediary, decimals, INTERMEDIARY_CONTRACT_ADDRESS });

  // Optional: Buy all items
  if (args.buyAll) {
    // Approve Intermediary to burnFrom your account during purchases
    const maxUint = ethers.MaxUint256;
    console.log('Approving GameIntermediary to spend TURBO for purchases...');
    const approveTx = await token.approve(INTERMEDIARY_CONTRACT_ADDRESS, maxUint);
    console.log(' approve tx:', approveTx.hash);
    await approveTx.wait();

    const nextItemId = await intermediary.nextItemId();
    console.log('nextItemId =', nextItemId.toString());

    for (let i = 1n; i < nextItemId; i++) {
      const item = await intermediary.gameItems(i);
      const name = item.name || item[0];
      const price = item.price || item[1];
      const itemType = item.itemType || item[2];
      const isActive = item.isActive ?? item[3];

      if (!isActive) {
        console.log(`Skipping inactive item ${i}`);
        continue;
      }

      const qty = (Number(itemType) === 0) ? 5 : 1; // buy 5 of consumables, 1 of upgrades
      const totalCost = price * BigInt(qty);

      console.log(`Purchasing item ${i} (${name}) x${qty} for cost ${ethers.formatUnits(totalCost, decimals)} TURBO`);
      const tx = await intermediary.purchaseItem(i, qty);
      console.log('  purchase tx:', tx.hash);
      await tx.wait();
    }

    bal = await token.balanceOf(wallet.address);
    console.log('Remaining TURBO after purchases:', ethers.formatUnits(bal, decimals));
  }

  // Optional: airdrop to a list
  if (args.airdrop) {
    const jsonPath = path.isAbsolute(args.airdrop) ? args.airdrop : path.join(process.cwd(), args.airdrop);
    const list = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const entry of list) {
      const { address, amount } = entry;
      if (!ethers.isAddress(address)) {
        console.warn('Skipping invalid address:', address);
        continue;
      }
      const amt = ethers.parseUnits(String(amount), decimals);
      console.log(`Airdropping ${amount} TURBO to ${address}...`);
      const tx = await token.transfer(address, amt);
      console.log('  transfer tx:', tx.hash);
      await tx.wait();
    }
  }

  // Optional: single transfer
  if (args.transfer) {
    const { to, amount } = args.transfer;
    if (!ethers.isAddress(to)) {
      throw new Error('Invalid --transfer address');
    }
    const amt = ethers.parseUnits(String(amount), decimals);
    console.log(`Transferring ${amount} TURBO to ${to}...`);
    const tx = await token.transfer(to, amt);
    console.log('  transfer tx:', tx.hash);
    await tx.wait();
  }

  bal = await token.balanceOf(wallet.address);
  console.log('Final owner balance:', ethers.formatUnits(bal, decimals));
  console.log('Done.');
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
