import { HardhatUserConfig } from "hardhat/config"

import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-web3"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "hardhat-typechain"

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    coverage: {
      url: "http://127.0.0.1:8555",
    },
  },
  paths: {
    artifacts: "./build/artifacts",
    cache: "./build/cache",
  },
  solidity: {
    version: "0.5.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
  typechain: {
    outDir: "./build/typechain/",
    target: "ethers-v5",
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 21,
  },
}

export default config
