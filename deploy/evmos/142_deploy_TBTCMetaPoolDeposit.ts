import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const metaSwapDeposit = await getOrNull("SaddleTBTCMetaPoolDeposit")
  if (metaSwapDeposit) {
    log(`reusing "SaddleTBTCMetaPoolDeposit" at ${metaSwapDeposit.address}`)
  } else {
    await deploy("SaddleTBTCMetaPoolDeposit", {
      from: deployer,
      log: true,
      contract: "MetaSwapDeposit",
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleTBTCMetaPoolDeposit",
      { from: deployer, log: true },
      "initialize",
      (
        await get("SaddleEvmosBTCPool")
      ).address,
      (
        await get("SaddleTBTCMetaPool")
      ).address,
      (
        await get("SaddleTBTCMetaPoolLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["TBTCMetaPoolDeposit"]
func.dependencies = ["TBTCMetaPoolTokens", "TBTCMetaPool"]
