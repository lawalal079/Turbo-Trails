// Script to check environment variables
console.log('Environment Variables:');
console.log('RPC_URL:', process.env.RPC_URL ? 'Set' : 'Not set');
console.log('PRIVATE_KEY:', process.env.PRIVATE_KEY ? 'Set' : 'Not set');
console.log('TURBO_TOKEN_CONTRACT_ADDRESS:', process.env.TURBO_TOKEN_CONTRACT_ADDRESS || 'Not set');
console.log('BACKEND_ADDRESS:', process.env.BACKEND_ADDRESS || 'Not set');

// Try to connect to the network
const { ethers } = require('ethers');

async function checkNetwork() {
  if (!process.env.RPC_URL) {
    console.log('\nRPC_URL is not set. Please set it in your .env.local file.');
    return;
  }

  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    console.log(`\nSuccessfully connected to network. Latest block: ${blockNumber}`);
  } catch (error) {
    console.error('\nFailed to connect to network:', error.message);
  }
}

checkNetwork();
