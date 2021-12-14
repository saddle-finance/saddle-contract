import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "hardhat"
import { GeneralizedSwapMigrator } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const genSwapMigrator = await getOrNull("GeneralizedSwapMigrator")
  if (genSwapMigrator) {
    log(`reusing "GeneralizedSwapMigrator" at ${genSwapMigrator.address}`)
  } else {
    await deploy("GeneralizedSwapMigrator", {
      from: deployer,
      log: true,
    })

    const contract: GeneralizedSwapMigrator = await ethers.getContract(
      "GeneralizedSwapMigrator",
    )
    const batchCall = [
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleUSDPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleUSDPoolV2")).address,
          oldPoolLPTokenAddress: (await get("SaddleUSDPoolLPToken")).address,
          newPoolLPTokenAddress: (await get("SaddleUSDPoolV2LPToken")).address,
          underlyingTokens: [
            (await get("DAI")).address,
            (await get("USDC")).address,
            (await get("USDT")).address,
          ],
        },
        false,
      ),
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleSUSDMetaPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleSUSDMetaPoolUpdated")).address,
          oldPoolLPTokenAddress: (
            await get("SaddleSUSDMetaPoolLPToken")
          ).address,
          newPoolLPTokenAddress: (
            await get("SaddleSUSDMetaPoolUpdatedLPToken")
          ).address,
          underlyingTokens: [
            (await get("SUSD")).address,
            (await get("SaddleUSDPoolV2LPToken")).address,
          ],
        },
        false,
      ),
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleTBTCMetaPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleTBTCMetaPoolUpdated")).address,
          oldPoolLPTokenAddress: (
            await get("SaddleTBTCMetaPoolLPToken")
          ).address,
          newPoolLPTokenAddress: (
            await get("SaddleTBTCMetaPoolUpdatedLPToken")
          ).address,
          underlyingTokens: [
            (await get("TBTC")).address,
            (await get("SaddleBTCPoolV2LPToken")).address,
          ],
        },
        false,
      ),
      await contract.populateTransaction.addMigrationData(
        (
          await get("SaddleWCUSDMetaPool")
        ).address,
        {
          newPoolAddress: (await get("SaddleWCUSDMetaPoolUpdated")).address,
          oldPoolLPTokenAddress: (
            await get("SaddleWCUSDMetaPoolLPToken")
          ).address,
          newPoolLPTokenAddress: (
            await get("SaddleWCUSDMetaPoolUpdatedLPToken")
          ).address,
          underlyingTokens: [
            (await get("WCUSD")).address,
            (await get("SaddleUSDPoolV2LPToken")).address,
          ],
        },
        false,
      ),
    ]

    const batchCallData = batchCall.map((x) => x.data)

    await execute(
      "GeneralizedSwapMigrator",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      true,
    )
  }
}
export default func
func.tags = ["GeneralizedSwapMigrator"]
func.dependencies = ["WCUSDMetaPoolTokens", "WCUSDMetaPoolUpdated"]
