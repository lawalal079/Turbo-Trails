// Simple script to test environment setup
const hre = require('hardhat');

async function main() {
  console.log('Testing environment setup...');
  console.log('Network:', hre.network.name);
  
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer address:', deployer.address);
  
  // Test RPC connection
  const block = await hre.ethers.provider.getBlock('latest');
  console.log('Latest block:', block.number);
  
  // Test environment variables
  console.log('Environment variables:');
  console.log('- RPC_URL:', process.env.RPC_URL ? 'Set' : 'Not set');
  console.log('- TURBO_TOKEN_CONTRACT_ADDRESS:', process.env.TURBO_TOKEN_CONTRACT_ADDRESS || 'Not set');
  console.log('- BACKEND_ADDRESS:', process.env.BACKEND_ADDRESS || 'Not set');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
