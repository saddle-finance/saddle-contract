import "@nomicfoundation/hardhat-toolbox"
import "@nomiclabs/hardhat-vyper"
import "hardhat-deploy"
import "hardhat-spdx-license-identifier"
import "hardhat-tracer"

import dotenv from "dotenv"
import { HardhatUserConfig } from "hardhat/config"
import "./tasks"
import {
  MULTISIG_ADDRESSES,
  PROD_CROSS_CHAIN_DEPLOYER_ADDRESS,
  PROD_DEPLOYER_ADDRESS,
} from "./utils/accounts"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "./utils/network"

dotenv.config()

// Array of private keys to be used as signers
// When running with mainnet networks, the first account will be used as the deployer by default
const accountsToUse = []

// Use the private key from the .env file if available
let deployerAccount = PROD_DEPLOYER_ADDRESS
if (process.env.DEPLOYER_PRIVATE_KEY) {
  accountsToUse.push(process.env.DEPLOYER_PRIVATE_KEY)
  deployerAccount = `privatekey://${process.env.DEPLOYER_PRIVATE_KEY}`
}

let crossChainDeployerAccount = PROD_CROSS_CHAIN_DEPLOYER_ADDRESS
if (process.env.CROSS_CHAIN_DEPLOYER_PRIVATE_KEY) {
  accountsToUse.push(process.env.CROSS_CHAIN_DEPLOYER_PRIVATE_KEY)
  crossChainDeployerAccount = `privatekey://${process.env.CROSS_CHAIN_DEPLOYER_PRIVATE_KEY}`
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      deploy: ["./deploy/hardhat/"],
      autoImpersonate: true,
    },
    mainnet: {
      url: ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] + process.env.ALCHEMY_API_KEY,
      chainId: parseInt(CHAIN_ID.MAINNET),
      deploy: ["./deploy/mainnet/"],
      verify: {
        etherscan: {
          apiUrl: "https://api.etherscan.io",
          apiKey: process.env.ETHERSCAN_API ?? "NO_KEY",
        },
      },
    },
    ropsten: {
      url: ALCHEMY_BASE_URL[CHAIN_ID.ROPSTEN] + process.env.ALCHEMY_API_KEY,
      chainId: parseInt(CHAIN_ID.ROPSTEN),
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/ropsten/"],
    },
    arbitrum_testnet: {
      url:
        ALCHEMY_BASE_URL[CHAIN_ID.ARBITRUM_TESTNET] +
        process.env.ALCHEMY_API_KEY,
      chainId: parseInt(CHAIN_ID.ARBITRUM_TESTNET),
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/arbitrum/"],
    },
    arbitrum_mainnet: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: parseInt(CHAIN_ID.ARBITRUM_MAINNET),
      deploy: ["./deploy/arbitrum/"],
      verify: {
        etherscan: {
          apiUrl: "https://api.arbiscan.io",
          apiKey: process.env.ETHERSCAN_ARB_API ?? "NO_KEY",
        },
      },
    },
    optimism_testnet: {
      url: "https://kovan.optimism.io",
      chainId: parseInt(CHAIN_ID.OPTIMISM_TESTNET),
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/optimism/"],
    },
    optimism_mainnet: {
      url:
        ALCHEMY_BASE_URL[CHAIN_ID.OPTIMISM_MAINNET] +
        process.env.ALCHEMY_API_KEY,
      chainId: parseInt(CHAIN_ID.OPTIMISM_MAINNET),
      deploy: ["./deploy/optimism/"],
      verify: {
        etherscan: {
          apiUrl: "https://api-optimistic.etherscan.io",
          apiKey: process.env.ETHERSCAN_OPT_API ?? "NO_KEY",
        },
      },
    },
    fantom_testnet: {
      url: "https://rpc.testnet.fantom.network/",
      chainId: parseInt(CHAIN_ID.FANTOM_TESTNET),
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/fantom/"],
    },
    fantom_mainnet: {
      url: "https://rpc.ftm.tools/",
      chainId: parseInt(CHAIN_ID.FANTOM_MAINNET),
      deploy: ["./deploy/fantom/"],
      verify: {
        etherscan: {
          apiUrl: "https://api.ftmscan.com",
          apiKey: process.env.ETHERSCAN_FTM_API ?? "NO_KEY",
        },
      },
    },
    evmos_testnet: {
      url: "https://eth.bd.evmos.dev:8545",
      chainId: parseInt(CHAIN_ID.EVMOS_TESTNET),
      deploy: ["./deploy/evmos_testnet/"],
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
    },
    evmos_mainnet: {
      live: true,
      url: "https://eth.bd.evmos.org:8545",
      chainId: parseInt(CHAIN_ID.EVMOS_MAINNET),
      deploy: ["./deploy/evmos/"],
      verify: {
        etherscan: {
          apiUrl: "https://evm.evmos.org",
          apiKey: "NO_KEY",
        },
      },
    },
    kava_testnet: {
      url: "https://evm.evm-alpha.kava.io",
      chainId: parseInt(CHAIN_ID.KAVA_TESTNET),
      deploy: ["./deploy/kava_testnet/"],
      verify: {
        etherscan: {
          apiUrl: "https://explorer.evm-alpha.kava.io",
        },
      },
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
    },
    kava_mainnet: {
      live: true,
      url: "https://evm2.kava.io",
      chainId: parseInt(CHAIN_ID.KAVA_MAINNET),
      deploy: ["./deploy/kava_mainnet/"],
      verify: {
        etherscan: {
          apiUrl: "https://explorer.kava.io",
          apiKey: "NO_KEY",
        },
      },
    },
    aurora_mainnet: {
      live: true,
      url: "https://mainnet.aurora.dev",
      chainId: parseInt(CHAIN_ID.AURORA_MAINNET),
      deploy: ["./deploy/aurora_mainnet/"],
      verify: {
        etherscan: {
          apiUrl: "https://api.aurorascan.dev",
          apiKey: process.env.ETHERSCAN_AURORA_API ?? "NO_KEY",
        },
      },
    },
    base_testnet: {
      url: "https://goerli.base.org",
      chainId: parseInt(CHAIN_ID.BASE_TESTNET),
      deploy: ["./deploy/base_testnet/"],
      verify: {
        etherscan: {
          apiUrl: "https://api-goerli.basescan.org",
          apiKey: process.env.ETHERSCAN_API ?? "NO_KEY",
        },
      },
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
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000,
          },
        },
      },
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
    overrides: {
      "contracts/helper/Multicall3.sol": {
        version: "0.8.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10000000,
          },
        },
      },
    },
  },
  vyper: {
    compilers: [
      { version: "0.2.12" },
      { version: "0.2.16" },
      { version: "0.2.15" },
      { version: "0.2.7" },
      { version: "0.3.1" },
      { version: "0.3.2" },
    ],
  },
  typechain: {
    outDir: "./build/typechain/",
    target: "ethers-v5",
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 21,
    enabled: process.env.REPORT_GAS ? true : false,
  },
  mocha: {
    timeout: 200000,
  },
  namedAccounts: {
    deployer: {
      default: deployerAccount,
    },
    crossChainDeployer: {
      default: crossChainDeployerAccount,
    },
    libraryDeployer: {
      default: 1, // use a different account for deploying libraries on the hardhat network
      1: 0, // use the same address as the main deployer on mainnet
      42161: 0, // use the same address on arbitrum mainnet
      10: 0, // use the same address on optimism mainnet
      250: 0, // use the same address on fantom mainnet
      9000: 0, // use the same address on evmos testnet
      9001: 0, // use the same address on evmos mainnnet
      2221: 0, // use the same address on kava testnet
      2222: 0, // use the same address on kava testnet
      3: 0, // use the same address on ropsten
      1313161554: 0, // use the same address on aurora mainnet
      84531: 0, // use the same address on base testnet
    },
    multisig: {
      default: 0,
      1: MULTISIG_ADDRESSES[1],
      42161: MULTISIG_ADDRESSES[42161],
      10: MULTISIG_ADDRESSES[10],
      250: MULTISIG_ADDRESSES[250],
      1313161554: MULTISIG_ADDRESSES[1313161554],
      9001: MULTISIG_ADDRESSES[9001],
    },
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },

  etherscan: {
    apiKey: {
      base_testnet: process.env.ETHERSCAN_API ?? "NO_KEY",
    },
    customChains: [
      {
        network: "base_testnet",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org/",
        },
      },
    ],
  },
}

// If we have any private keys, use them for mainnet networks as default signers
if (accountsToUse.length > 0 && config.networks) {
  for (const network of Object.keys(config.networks)) {
    // if network name includes "mainnet", change the accounts
    if (network.includes("mainnet")) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      config.networks[network]!.accounts = accountsToUse
    }
  }
}

export default config
