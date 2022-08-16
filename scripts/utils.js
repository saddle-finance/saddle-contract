const DEPLOYMENTS_TO_NETWORK = {
  arbitrum_mainnet: {
    id: 42161,
    test: false,
    explorerApi: "https://api.arbiscan.io",
    apiKeyName: "ARBISCAN_API",
  },
  evmos_mainnet: { id: 9001, test: false },
  evmos_testnet: { id: 9000, test: true },
  fantom_mainnet: {
    id: 250,
    test: false,
    explorerApi: "https://api.ftmscan.com",
    apiKeyName: "FTMSCAN_API",
  },
  mainnet: {
    id: 1,
    test: false,
    explorerApi: "https://api.etherscan.io",
    apiKeyName: "ETHERSCAN_API",
  },
  optimism_mainnet: {
    id: 10,
    test: false,
    explorerApi: "https://api-optimistic.etherscan.io",
    apiKeyName: "ETHERSCAN_API",
  },
  ropsten: {
    id: 3,
    test: true,
    explorerApi: "https://api-ropsten.etherscan.io",
    apiKeyName: "ETHERSCAN_API",
  },
  kovan: {
    id: 42,
    test: true,
    explorerApi: "https://api-kovan.etherscan.io",
    apiKeyName: "ETHERSCAN_API",
  },
  localhost: { id: 31337, test: true },
}

module.exports = { DEPLOYMENTS_TO_NETWORK }
