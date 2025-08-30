// Hardhat task to check environment and network status
const { task } = require('hardhat/config');

task('check-env', 'Check environment and network status')
  .setAction(async (taskArgs, hre) => {
    console.log('Checking environment and network status...');
    
    // Check network
    console.log('\n=== Network ===');
    console.log('Network name:', hre.network.name);
    console.log('Network config:', hre.network.config);
    
    // Check signers
    console.log('\n=== Signers ===');
    const signers = await hre.ethers.getSigners();
    console.log('Signer 0 address:', signers[0].address);
    
    // Check provider
    console.log('\n=== Provider ===');
    const block = await hre.ethers.provider.getBlock('latest');
    console.log('Latest block:', block.number);
    const network = await hre.ethers.provider.getNetwork();
    console.log('Network chainId:', network.chainId);
    
    // Check environment variables
    console.log('\n=== Environment Variables ===');
    console.log('RPC_URL:', process.env.RPC_URL ? 'Set' : 'Not set');
    console.log('PRIVATE_KEY:', process.env.PRIVATE_KEY ? 'Set' : 'Not set');
    console.log('TURBO_TOKEN_CONTRACT_ADDRESS:', process.env.TURBO_TOKEN_CONTRACT_ADDRESS || 'Not set');
    console.log('BACKEND_ADDRESS:', process.env.BACKEND_ADDRESS || 'Not set');
  });

module.exports = {};
