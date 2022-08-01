import "@nomiclabs/hardhat-vyper"
import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-web3"
import "@nomiclabs/hardhat-etherscan"
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "hardhat-deploy"
import "hardhat-spdx-license-identifier"

import { HardhatUserConfig, task } from "hardhat/config"
import dotenv from "dotenv"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "./utils/network"
import { MULTISIG_ADDRESSES, PROD_DEPLOYER_ADDRESS } from "./utils/accounts"
import { Deployment } from "hardhat-deploy/dist/types"
import { HttpNetworkUserConfig } from "hardhat/types"

dotenv.config()

if (process.env.HARDHAT_FORK) {
  process.env["HARDHAT_DEPLOY_FORK"] = process.env.HARDHAT_FORK
}

let config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      deploy: ["./deploy/hardhat/"],
      autoImpersonate: true,
    },
    mainnet: {
      url: ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] + process.env.ALCHEMY_API_KEY,
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
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/ropsten/"],
    },
    arbitrum_testnet: {
      url:
        ALCHEMY_BASE_URL[CHAIN_ID.ARBITRUM_TESTNET] +
        process.env.ALCHEMY_API_KEY,
      chainId: 421611,
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/arbitrum/"],
    },
    arbitrum_mainnet: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      deploy: ["./deploy/arbitrum/"],
      verify: {
        etherscan: {
          apiUrl: "https://api.arbiscan.io",
          apiKey: "6IJ9VIDV55VNTPAA8TRKQREVWQJDA98FEK",
        },
      },
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
      verify: {
        etherscan: {
          apiUrl: "https://api-optimistic.etherscan.io",
          apiKey: "8A88XPGCP6IQXRJGM5NKMBMMGT7NNRBIMF",
        },
      },
    },
    fantom_testnet: {
      url: "https://rpc.testnet.fantom.network/",
      chainId: 4002,
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
      deploy: ["./deploy/fantom/"],
    },
    fantom_mainnet: {
      url: "https://rpc.ftm.tools/",
      chainId: 250,
      deploy: ["./deploy/fantom/"],
      verify: {
        etherscan: {
          apiUrl: "https://api.ftmscan.com",
          apiKey: "YKFDUZYGB28APW5KQQI4MH1CKRZN8IRYMP",
        },
      },
    },
    evmos_testnet: {
      url: "https://eth.bd.evmos.dev:8545",
      chainId: 9000,
      deploy: ["./deploy/evmos_testnet/"],
      accounts: {
        mnemonic: process.env.MNEMONIC_TEST_ACCOUNT,
      },
    },
    evmos_mainnet: {
      live: true,
      url: "https://eth.bd.evmos.org:8545",
      chainId: 9001,
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
      chainId: 2221,
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
      url: "https://evm.kava.io",
      chainId: 2222,
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

if (process.env.FORK_NETWORK && config.networks) {
  const forkNetworkName = process.env.FORK_NETWORK as string
  const blockNumber = process.env.FORK_BLOCK_NUMBER
    ? parseInt(process.env.FORK_BLOCK_NUMBER)
    : undefined
  console.log(`FORK_NETWORK is set to ${forkNetworkName}`)
  console.log(
    `FORK_BLOCK_NUMBER is set to ${
      blockNumber ? blockNumber : "undefined (using latest block number)"
    }`,
  )

  if (!config.networks[forkNetworkName]) {
    throw new Error(
      `FORK_NETWORK is set to ${forkNetworkName}, but no network with that name is defined in the config.`,
    )
  }
  if (!(config.networks[forkNetworkName] as HttpNetworkUserConfig).url) {
    throw new Error(
      `FORK_NETWORK is set to ${forkNetworkName}, but no url is defined for that network in the config.`,
    )
  }
  if (!CHAIN_ID[forkNetworkName.toUpperCase()]) {
    throw new Error(
      `FORK_NETWORK is set to ${forkNetworkName}, but no chainId is defined for that network in the CHAIN_ID constant.`,
    )
  }
  const forkingURL = (config.networks[forkNetworkName] as HttpNetworkUserConfig)
    .url as string
  const forkingChainId = parseInt(CHAIN_ID[forkNetworkName.toUpperCase()])
  const externalDeploymentsFolder = `deployments/${forkNetworkName.toLowerCase()}`
  const deployPaths = config.networks[forkNetworkName]?.deploy as string[]

  console.log(
    `Attempting to fork ${forkNetworkName} from ${forkingURL} with chainID of ${forkingChainId}. External deployments folder is ${externalDeploymentsFolder}`,
  )

  config = {
    ...config,
    networks: {
      ...config.networks,
      hardhat: {
        ...config.networks.hardhat,
        forking: {
          url: forkingURL,
          blockNumber: blockNumber,
        },
        chainId: forkingChainId,
        deploy: deployPaths,
      },
    },
    namedAccounts: {
      ...config.namedAccounts,
      deployer: {
        [String(forkingChainId)]: PROD_DEPLOYER_ADDRESS,
      },
      multisig: {
        [String(forkingChainId)]: MULTISIG_ADDRESSES[forkingChainId.toString()],
      },
    },
    external: {
      deployments: {
        localhost: [externalDeploymentsFolder],
      },
    },
  }
}

// Override the default deploy task
task("deploy", async (taskArgs, hre, runSuper) => {
  const { all } = hre.deployments
  /*
   * Pre-deployment actions
   */

  // Load exiting deployments
  const existingDeployments: { [p: string]: Deployment } = await all()
  // Create hard copy of existing deployment name to address mapping
  const existingDeploymentToAddressMap: { [p: string]: string } = Object.keys(
    existingDeployments,
  ).reduce((acc: { [p: string]: string }, key) => {
    acc[key] = existingDeployments[key].address
    return acc
  }, {})

  /*
   * Run super task
   */
  await runSuper(taskArgs)

  /*
   * Post-deployment actions
   */
  const updatedDeployments: { [p: string]: Deployment } = await all()

  // Filter out any existing deployments that have not changed
  const newDeployments: { [p: string]: Deployment } = Object.keys(
    updatedDeployments,
  ).reduce((acc: { [p: string]: Deployment }, key) => {
    if (
      !existingDeploymentToAddressMap.hasOwnProperty(key) ||
      existingDeploymentToAddressMap[key] !== updatedDeployments[key].address
    ) {
      acc[key] = updatedDeployments[key]
    }
    return acc
  }, {})

  // Print the new deployments to the console
  if (Object.keys(newDeployments).length > 0) {
    console.log("\nNew deployments:")
    console.table(
      Object.keys(newDeployments).map((k) => [k, newDeployments[k].address]),
    )
  } else {
    console.warn("\nNo new deployments found")
  }
})

export default config
