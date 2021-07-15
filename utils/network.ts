export const CHAIN_ID = {
  MAINNET: "1",
  ROPSTEN: "3",
  KOVAN: "42",
  HARDHAT: "31337",
}

export function isMainnet(networkId: string): boolean {
  return networkId == CHAIN_ID.MAINNET
}

export function isTestNetwork(networkId: string): boolean {
  return (
    networkId == CHAIN_ID.HARDHAT ||
    networkId == CHAIN_ID.ROPSTEN ||
    networkId == CHAIN_ID.KOVAN
  )
}
