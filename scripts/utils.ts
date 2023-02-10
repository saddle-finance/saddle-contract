import { JsonRpcProvider } from "@ethersproject/providers"
import { Signer } from "ethers"
import { ethers } from "hardhat"
import { Network } from "hardhat/types"

export const DEPLOYMENTS_TO_NETWORK = {
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
  localhost: { id: 31337, test: true },
}

export async function logNetworkDetails(
  provider: JsonRpcProvider,
  network: Network,
) {
  const blockData = await provider.getBlock("latest")
  const date = new Date(blockData.timestamp * 1000)
  console.log(`Name         : ${network.name}`)
  console.log(`ChainId      : ${provider.network.chainId}`)
  console.log(`BlockNumber  : ${blockData.number}`)
  console.log(
    `Timestamp    : ${blockData.timestamp} // ${date.toLocaleString()}`,
  )
}

export function getHardhatTestSigners(): Signer[] {
  const HDNode = ethers.utils.HDNode.fromMnemonic(
    "test test test test test test test test test test test junk",
  )

  const signers = []
  for (let i = 0; i < 20; i++) {
    const derivedNode = HDNode.derivePath(`m/44'/60'/0'/0/${i}`)
    signers.push(new ethers.Wallet(derivedNode.privateKey))
  }
  return signers
}

export function getHardhatTestSigner(index = 0): Signer {
  const HDNode = ethers.utils.HDNode.fromMnemonic(
    "test test test test test test test test test test test junk",
  )

  const derivedNode = HDNode.derivePath(`m/44'/60'/0'/0/${index}`)
  return new ethers.Wallet(derivedNode.privateKey)
}
