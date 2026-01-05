require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"
    },

    sepolia: {
      provider: () =>
        new HDWalletProvider(
          [process.env.PRIVATE_KEY],       // Private key array
          process.env.RPC_URL              // INFURA atau RPC publik
        ),
      network_id: 11155111,
      gas: 5000000,
      gasPrice: 30000000000,               // 30 gwei
      confirmations: 2,
      timeoutBlocks: 200,
      networkCheckTimeout: 100000,         // ← penting supaya TIDAK TIMEOUT
      skipDryRun: true
    }
  },

  compilers: {
    solc: {
      version: "0.8.17",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
