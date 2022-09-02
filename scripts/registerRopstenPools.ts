import { ethers } from "hardhat"

import { deployments } from "hardhat"
import { ZERO_ADDRESS } from "../test/testUtils"
import { PoolRegistry } from "../build/typechain/"
import { PoolType } from "../utils/constants"

const { get, execute } = deployments

async function registerPools() {
  const { deployer } = await ethers.getNamedSigners()

  const poolRegistry = (await ethers.getContract(
    "PoolRegistry",
  )) as PoolRegistry
  const usdv2InputData = {
    poolAddress: (await get("SaddleUSDPoolV2")).address,
    typeOfAsset: PoolType.USD,
    poolName: ethers.utils.formatBytes32String("USDv2base"),
    targetAddress: (await get("SaddleUSDPoolV2")).address,
    metaSwapDepositAddress: ZERO_ADDRESS,
    isSaddleApproved: true,
    isRemoved: false,
    isGuarded: false,
  }

  const susdMetaV2InputData = {
    poolAddress: (await get("SaddleSUSDMetaPoolUpdated")).address,
    typeOfAsset: PoolType.USD,
    poolName: ethers.utils.formatBytes32String("sUSD meta v2"),
    targetAddress: (await get("SaddleSUSDMetaPoolUpdated")).address,
    metaSwapDepositAddress: (await get("SaddleSUSDMetaPoolUpdatedDeposit"))
      .address,
    isSaddleApproved: true,
    isRemoved: false,
    isGuarded: false,
  }
  await execute(
    "PoolRegistry",
    { from: deployer.address, log: true },
    "addPool",
    usdv2InputData,
  )
  await execute(
    "PoolRegistry",
    { from: deployer.address, log: true },
    "addPool",
    susdMetaV2InputData,
  )
}

registerPools()
