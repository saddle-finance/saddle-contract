import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleSUSDMetaPoolDeposit = await getOrNull("SaddleSUSDMetaPoolDeposit")
  if (saddleSUSDMetaPoolDeposit) {
    log(`reusing "SaddleSUSDMetaPool" at ${saddleSUSDMetaPoolDeposit.address}`)
  } else {
    await deploy("SaddleSUSDMetaPoolDeposit", {
      from: deployer,
      log: true,
      contract: "MetaSwapDeposit",
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleSUSDMetaPoolDeposit",
      { from: deployer, log: true },
      "initialize",
      (await get("SaddleUSDPool")).address,
      (await get("SaddleSUSDMetaPool")).address,
      (await get("SaddleSUSDMetaPoolLPToken")).address,
    )
  }
}
export default func
func.tags = ["SUSDMetaPoolDeposit"]
func.dependencies = ["SUSDMetaPool", "SUSDMetaPoolTokens"]
