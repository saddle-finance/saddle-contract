// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/*eslint-disable*/
import { ethers } from "hardhat"

import { formatBytes32String } from "ethers/lib/utils"
import {
  PoolRegistry
} from "../build/typechain"

async function main() {
  // at index 0 is hardhat deployer address
  // on localhost network, we use this address as admins for most contracts
  const signers = await ethers.getSigners()

  const poolRegistry = (await ethers.getContract(
    "PoolRegistry",
  )) as PoolRegistry
  const USD_POOL_CONTRACT_NAME = "USD"
  const vETH2_POOL_CONTRACT_NAME = "vETH2"

  const usdPoolLPTokenAddress = "0x6D1c89F08bbB35d80B6E6b6d58D2bEFE021eFE8d"
  const vETH2PoolLPTokenAddress = "0xd44a47B19a7862709588D574f39480f9C4DED1A6"

  const usdPool = await poolRegistry.getPoolDataByName(
    formatBytes32String(USD_POOL_CONTRACT_NAME),
  )
  
  const v2EthPool = await poolRegistry.getPoolDataByName(
    formatBytes32String(vETH2_POOL_CONTRACT_NAME),
  )

  const updatedUsdPool = constructUpdatedPool(usdPool, usdPoolLPTokenAddress)
  const updatedvETH2Pool = constructUpdatedPool(v2EthPool, vETH2PoolLPTokenAddress)
    
  await Promise.all([poolRegistry.updatePool(updatedUsdPool), poolRegistry.updatePool(updatedvETH2Pool)])

}
  
function constructUpdatedPool(currentPool, lpToken) {
  const {
    poolAddress,
    typeOfAsset,
    poolName,
    targetAddress,
    tokens,
    underlyingTokens,
    basePoolAddress,
    metaSwapDepositAddress,
    isSaddleApproved,
    isRemoved,
    isGuarded,
  } = currentPool

  return {
    poolAddress,
    typeOfAsset,
    poolName,
    targetAddress,
    tokens,
    underlyingTokens,
    basePoolAddress,
    metaSwapDepositAddress,
    isSaddleApproved,
    isRemoved,
    isGuarded,
    lpToken
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
