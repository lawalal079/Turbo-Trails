// Keeps specified wallets topped up with TURBO by minting when balances fall below a threshold.
// Usage examples:
//   node scripts/topUpTurbo.js --recipients scripts/recipients.json --target 100000 --min 80000
//   node scripts/topUpTurbo.js --recipients scripts/recipients.json --target 100000 --interval 300000
// Notes:
// - Requires .env.local with: RPC_URL, PRIVATE_KEY (token owner), TURBO_TOKEN_CONTRACT_ADDRESS
// - PRIVATE_KEY must be the TurboToken owner to call ownerMint().
// - Amounts are in whole TURBO; script applies token decimals.

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
  const args = { recipients: '', target: '100000', min: null, interval: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--recipients') args.recipients = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--min') args.min = argv[++i];
    else if (a === '--interval') args.interval = argv[++i]; // ms
  }
  if (!args.recipients) throw new Error('Missing --recipients <file>');
  return args;
}

function loadRecipients(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const list = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!Array.isArray(list)) throw new Error('recipients file must be an array');
  const normalized = list.filter(Boolean).map((x) => {
    if (typeof x === 'string') return { address: x, target: null };
    return { address: x.address, target: x.target ?? null };
  });
  return normalized;
}

async function topUpOnce({ provider, token, decimals, recipients, defaultTarget, minTrigger }) {
  for (const entry of recipients) {
    const addr = entry.address;
    if (!ethers.isAddress(addr)) {
      console.warn('Skipping invalid address:', addr);
      continue;
    }
    const target = entry.target ? ethers.parseUnits(String(entry.target), decimals) : ethers.parseUnits(String(defaultTarget), decimals);
    const minBal = minTrigger
      ? ethers.parseUnits(String(minTrigger), decimals)
      : target; // if no min provided, top-up whenever below target

    const bal = await token.balanceOf(addr);
    const balFmt = ethers.formatUnits(bal, decimals);
    const minFmt = ethers.formatUnits(minBal, decimals);
    const targetFmt = ethers.formatUnits(target, decimals);

    console.log(`Address ${addr}: balance=${balFmt} TURBO | min=${minFmt} | target=${targetFmt}`);

    if (bal < minBal) {
      const need = target - bal;
      const needFmt = ethers.formatUnits(need, decimals);
      console.log(`  Top-up needed: minting ${needFmt} TURBO to ${addr} ...`);
      const tx = await token.ownerMint(addr, need);
      console.log('   ownerMint tx:', tx.hash);
      await tx.wait();
    } else {
      console.log('  OK: no mint required');
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const { PRIVATE_KEY, RPC_URL, TURBO_TOKEN_CONTRACT_ADDRESS } = process.env;
  if (!PRIVATE_KEY || !RPC_URL || !TURBO_TOKEN_CONTRACT_ADDRESS) {
    throw new Error('Set PRIVATE_KEY, RPC_URL, TURBO_TOKEN_CONTRACT_ADDRESS in .env.local');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log('Owner wallet:', wallet.address);

  const artifact = await loadArtifact('TurboToken');
  const token = new ethers.Contract(TURBO_TOKEN_CONTRACT_ADDRESS, artifact.abi, wallet);
  const decimals = await token.decimals();

  const recipients = loadRecipients(args.recipients);
  const defaultTarget = Number(args.target);
  const minTrigger = args.min ? Number(args.min) : null;

  if (!args.interval) {
    await topUpOnce({ provider, token, decimals, recipients, defaultTarget, minTrigger });
    console.log('Done.');
    return;
  }

  const intervalMs = Number(args.interval);
  console.log(`Starting loop: interval=${intervalMs}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await topUpOnce({ provider, token, decimals, recipients, defaultTarget, minTrigger });
    } catch (e) {
      console.error('Top-up iteration failed:', e.message || e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
