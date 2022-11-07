import "@nomicfoundation/hardhat-toolbox"
import "@nomiclabs/hardhat-vyper"
import "hardhat-deploy"
import "hardhat-spdx-license-identifier"
import "hardhat-tracer"

import dotenv from "dotenv"
import { HardhatUserConfig } from "hardhat/config"
import "./tasks"
import { MULTISIG_ADDRESSES } from "./utils/accounts"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "./utils/network"

dotenv.config()

// Use the private key from the .env file if available
const crossChainDeployerAccount = process.env.CROSS_CHAIN_DEPLOYER_PRIVATE_KEY
  ? "privatekey://" + process.env.CROSS_CHAIN_DEPLOYER_PRIVATE_KEY
  : "0x979B44CFc7a9B54BED8a3C4FD674B09c194219fD"

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
      default: 0, // here this will by default take the first account as deployer
      1: 0, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
      42161: 0, // use the same address on arbitrum mainnet
      10: 0, // use the same address on optimism mainnet
      250: 0, // use the same address on fantom mainnet
      9000: 0, // use the same address on evmos testnet
      9001: 0, // use the same address on evmos mainnnet
      2221: 0, // use the same address on kava testnet
      2222: 0, // use the same address on kava testnet
      3: 0, // use the same address on ropsten
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
    },
    multisig: {
      default: 0,
      1: MULTISIG_ADDRESSES[1],
      42161: MULTISIG_ADDRESSES[42161],
      10: MULTISIG_ADDRESSES[10],
      250: MULTISIG_ADDRESSES[250],
    },
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
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
    optimism_mainnet: {
      ...config.networks?.optimism_mainnet,
      accounts: JSON.parse(process.env.ACCOUNT_PRIVATE_KEYS),
    },
    fantom_mainnet: {
      ...config.networks?.fantom_mainnet,
      accounts: JSON.parse(process.env.ACCOUNT_PRIVATE_KEYS),
    },
    evmos_mainnet: {
      ...config.networks?.evmos_mainnet,
      accounts: JSON.parse(process.env.ACCOUNT_PRIVATE_KEYS),
    },
    kava_mainnet: {
      ...config.networks?.kava_mainnet,
      accounts: JSON.parse(process.env.ACCOUNT_PRIVATE_KEYS),
    },
  }
}

export default config
