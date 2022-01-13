import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-web3"
import "@nomiclabs/hardhat-etherscan"
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "hardhat-deploy"
import "hardhat-spdx-license-identifier"

import { HardhatUserConfig } from "hardhat/config"
import dotenv from "dotenv"
import { ethers } from "ethers"

dotenv.config()

if (process.env.HARDHAT_FORK) {
  process.env["HARDHAT_DEPLOY_FORK"] = process.env.HARDHAT_FORK
}

let config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      deploy: ["./deploy/mainnet/"],
    },
    mainnet: {
      url: process.env.ALCHEMY_API,
      deploy: ["./deploy/mainnet/"],
    },
    ropsten: {
      url: process.env.ALCHEMY_API_ROPSTEN,
      gasPrice: ethers.utils.parseUnits("1.01", "gwei").toNumber(),
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/mainnet/"],
    },
    arbitrum_testnet: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/arbitrum/"],
    },
    arbitrum_mainnet: {
      url: "https://arb1.arbitrum.io/rpc",
      gasPrice: ethers.utils.parseUnits("2", "gwei").toNumber(),
      deploy: ["./deploy/arbitrum/"],
    },
    optimism_testnet: {
      url: "https://kovan.optimism.io",
      chainId: 69,
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/optimism/"],
    },
    optimism_mainnet: {
      url: "https://mainnet.optimism.io",
      chainId: 10,
      deploy: ["./deploy/optimism/"],
    },
  },
  paths: {
    sources: "./contracts",
    artifacts: "./build/artifacts",
    cache: "./build/cache",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000,
          },
        },
      },
      {
        version: "0.5.16",
      },
    ],
  },
  typechain: {
    outDir: "./build/typechain/",
    target: "ethers-v5",
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 21,
  },
  mocha: {
    timeout: 200000,
  },
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
      1: 0, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
      42161: 0,
      10: 0,
    },
    libraryDeployer: {
      default: 1, // use a different account for deploying libraries on the hardhat network
      1: 0, // use the same address as the main deployer on mainnet
      42161: 0, // use the same address on arbitrum mainnet
      10: 0, // use the same address on optimism mainnet
    },
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
}

if (process.env.ETHERSCAN_API) {
  config = { ...config, etherscan: { apiKey: process.env.ETHERSCAN_API } }
}

if (process.env.ACCOUNT_PRIVATE_KEYS) {
  config.networks = {
    ...config.networks,
    mainnet: {
      ...config.networks?.mainnet,
      accounts: JSON.parse(process.env.ACCOUNT_PRIVATE_KEYS),
    },
    arbitrum_mainnet: {
      ...config.networks?.arbitrum_mainnet,
      accounts: JSON.parse(process.env.ACCOUNT_PRIVATE_KEYS),
    },
  }
}

if (process.env.FORK_MAINNET === "true" && config.networks) {
  console.log("FORK_MAINNET is set to true")
  config = {
    ...config,
    networks: {
      ...config.networks,
      hardhat: {
        ...config.networks.hardhat,
        forking: {
          url: process.env.ALCHEMY_API ? process.env.ALCHEMY_API : "",
        },
        chainId: 1,
      },
    },
    external: {
      deployments: {
        localhost: ["deployments/mainnet"],
      },
    },
  }
}

export default config
