import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleSUSDMetaPool = await getOrNull("SaddleSUSDMetaPoolUpdatedDeposit")
  if (saddleSUSDMetaPool) {
    log(
      `reusing "SaddleSUSDMetaPoolUpdatedDeposit" at ${saddleSUSDMetaPool.address}`,
    )
  } else {
    log(
      `deployed SUSD meta pool deposit (targeting "MetaPoolDeposit") at ${
        (await get("MetaSwapDeposit")).address
      }`,
    )
    await save("SaddleSUSDMetaPoolUpdatedDeposit", await get("MetaSwapDeposit"))

    await execute(
      "SaddleSUSDMetaPoolUpdatedDeposit",
      { from: deployer, log: true, gasLimit: 1_000_000 },
      "initialize",
      (
        await get("SaddleUSDPoolV2")
      ).address,
      (
        await get("SaddleSUSDMetaPoolUpdated")
      ).address,
      (
        await get("SaddleSUSDMetaPoolUpdatedLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["SUSDMetaPoolUpdatedDeposit"]
func.dependencies = ["SUSDMetaPoolTokens", "SUSDMetaPoolUpdated"]
