require('dotenv').config({ path: require('path').join(__dirname, '.env.local') });
require('@nomicfoundation/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');

const { RPC_URL, PRIVATE_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      metadata: {
        bytecodeHash: "none", // disable ipfs
        useLiteralContent: true // store source code in the json file directly
      }
    }
  },
  networks: {
    monad: {
      url: RPC_URL || 'https://testnet-rpc.monad.xyz',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 10143
    },
  }
};
