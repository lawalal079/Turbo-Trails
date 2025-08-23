require('dotenv').config({ path: require('path').join(__dirname, '.env.local') });
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-verify');
require('hardhat-sourcify');

const { RPC_URL, PRIVATE_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
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
  },
  etherscan: {
    apiKey: {
      monad: 'dummy-api-key'
    },
    customChains: [
      {
        network: 'monad',
        chainId: 10143,
        urls: {
          apiURL: 'https://sourcify-api-monad.blockvision.org/server/verify',
          browserURL: 'https://testnet.monadexplorer.com'
        }
      }
    ]
  },
  sourcify: {
    enabled: true,
    apiUrl: 'https://sourcify-api-monad.blockvision.org',
    browserUrl: 'https://testnet.monadexplorer.com'
  }
};
