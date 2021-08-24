import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-web3"
import "@nomiclabs/hardhat-etherscan"
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "hardhat-deploy"
import "hardhat-spdx-license-identifier"
import "@eth-optimism/hardhat-ovm"

import { HardhatUserConfig } from "hardhat/config"
import dotenv from "dotenv"
import { ethers } from "ethers"

dotenv.config()

let config: HardhatUserConfig = {
  networks: {
    hardhat: {
      hardfork: process.env.CODE_COVERAGE ? "berlin" : "london",
    },
    mainnet: {
      url: process.env.ALCHEMY_API,
      gasPrice: 60 * 1000000000,
    },
    ropsten: {
      url: process.env.ALCHEMY_API_ROPSTEN,
      gasPrice: ethers.utils.parseUnits("1.01", "gwei").toNumber(),
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
    },
    optimistic: {
      url: "http://127.0.0.1:8545",
      accounts: [
        "0xcfd793877e87cf549fef0142a21adb036be5e1990eaaee7f358f53da92d08730",
      ],
      gasPrice: 0,
      ovm: true, // This sets the network as using the ovm and ensure contract will be compiled against that.
      chainId: 420,
    },
    "optimistic-kovan": {
      url: "https://kovan.optimism.io",
      accounts: [
        "0xcfd793877e87cf549fef0142a21adb036be5e1990eaaee7f358f53da92d08730",
      ],
      gasPrice: 15000000,
      ovm: true, // This sets the network as using the ovm and ensure contract will be compiled against that.
      chainId: 69,
    },
  },
  paths: {
    artifacts: "./build/artifacts",
    cache: "./build/cache",
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000,
          },
        },
      },
    ],
  },
  ovm: {
    solcVersion: "0.6.12",
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
      69: 0,
      420: 0,
    },
    libraryDeployer: {
      default: 1, // use a different account for deploying libraries on the hardhat network
      1: 0, // use the same address as the main deployer on mainnet
      69: 0,
      420: 0,
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
        hardhat: ["deployments/mainnet"],
      },
    },
  }
}

export default config
