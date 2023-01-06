import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  if ((await getChainId()) === CHAIN_ID.MAINNET) {
    log("Cannot add to migrator on mainnet. Need to be executed by a multisig.")
    return
  }

  // Check if migrator exists
  await get("GeneralizedSwapMigrator")
  const contract = await ethers.getContract("GeneralizedSwapMigrator")

  const batchCall = [
    await contract.populateTransaction.addMigrationData(
      (
        await get("SaddleSUSDMetaPoolUpdated")
      ).address,
      {
        newPoolAddress: (await get("SaddleSUSDMetaPoolV3")).address,
        oldPoolLPTokenAddress: (
          await get("SaddleSUSDMetaPoolUpdatedLPToken")
        ).address,
        newPoolLPTokenAddress: (
          await get("SaddleSUSDMetaPoolV3LPToken")
        ).address,
        tokens: [
          (await get("SUSD")).address,
          (await get("SaddleUSDPoolV2LPToken")).address,
        ],
      },
      false,
    ),
    await contract.populateTransaction.addMigrationData(
      (
        await get("SaddleTBTCMetaPoolUpdated")
      ).address,
      {
        newPoolAddress: (await get("SaddleTBTCMetaPoolV3")).address,
        oldPoolLPTokenAddress: (
          await get("SaddleTBTCMetaPoolUpdatedLPToken")
        ).address,
        newPoolLPTokenAddress: (
          await get("SaddleTBTCMetaPoolV3LPToken")
        ).address,
        tokens: [
          (await get("TBTCv2")).address,
          (await get("SaddleBTCPoolV2LPToken")).address,
        ],
      },
      false,
    ),
    await contract.populateTransaction.addMigrationData(
      (
        await get("SaddleWCUSDMetaPoolUpdated")
      ).address,
      {
        newPoolAddress: (await get("SaddleWCUSDMetaPoolV3")).address,
        oldPoolLPTokenAddress: (
          await get("SaddleWCUSDMetaPoolUpdatedLPToken")
        ).address,
        newPoolLPTokenAddress: (
          await get("SaddleWCUSDMetaPoolV3LPToken")
        ).address,
        tokens: [
          (await get("WCUSD")).address,
          (await get("SaddleUSDPoolV2LPToken")).address,
        ],
      },
      false,
    ),
  ]

  const batchCallData = batchCall.map((x) => x.data).filter(Boolean)

  await execute(
    "GeneralizedSwapMigrator",
    {
      from: deployer,
      log: true,
    },
    "batch",
    batchCallData,
    true,
  )
}
export default func
