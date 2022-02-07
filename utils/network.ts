export const CHAIN_ID = {
  MAINNET: "1",
  ROPSTEN: "3",
  KOVAN: "42",
  HARDHAT: "31337",
  ARBITRUM_MAINNET: "42161",
  ARBITRUM_TESTNET: "421611",
  OPTIMISM_MAINNET: "10",
  OPTIMISM_TESTNET: "69",
  FANTOM_MAINNET: "250",
  FANTOM_TESTNET: "4002",
}

export function isMainnet(networkId: string): boolean {
  return (
    networkId == CHAIN_ID.MAINNET ||
    networkId == CHAIN_ID.ARBITRUM_MAINNET ||
    networkId == CHAIN_ID.OPTIMISM_MAINNET ||
    networkId == CHAIN_ID.FANTOM_MAINNET
  )
}

export function isTestNetwork(networkId: string): boolean {
  return (
    networkId == CHAIN_ID.HARDHAT ||
    networkId == CHAIN_ID.ROPSTEN ||
    networkId == CHAIN_ID.KOVAN ||
    networkId == CHAIN_ID.ARBITRUM_TESTNET ||
    networkId == CHAIN_ID.OPTIMISM_TESTNET ||
    networkId == CHAIN_ID.FANTOM_TESTNET
  )
}

export const ALCHEMY_BASE_URL = {
  [CHAIN_ID.MAINNET]: "https://eth-mainnet.alchemyapi.io/v2/",
  [CHAIN_ID.ROPSTEN]: "https://eth-ropsten.alchemyapi.io/v2/",
  [CHAIN_ID.ARBITRUM_MAINNET]: "https://arb-mainnet.g.alchemy.com/v2/",
  [CHAIN_ID.ARBITRUM_TESTNET]: "https://arb-rinkeby.g.alchemy.com/v2/",
}
