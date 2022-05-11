import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleSUSDMetaPool = await getOrNull("SaddleSUSDMetaPoolDeposit")
  if (saddleSUSDMetaPool) {
    log(`reusing "SaddleSUSDMetaPoolDeposit" at ${saddleSUSDMetaPool.address}`)
  } else {
    const result = await deploy("SaddleSUSDMetaPoolDeposit", {
      from: deployer,
      log: true,
      contract: "MetaSwapDeposit",
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleSUSDMetaPoolDeposit",
      { from: deployer, log: true },
      "initialize",
      (
        await get("SaddleUSDPoolV2")
      ).address,
      (
        await get("SaddleSUSDMetaPool")
      ).address,
      (
        await get("SaddleSUSDMetaPoolLPToken")
      ).address,
    )

    if ((await getOrNull("MetaSwapDeposit")) === null) {
      await save("MetaSwapDeposit", result)
    }
  }
}
export default func
func.tags = ["SUSDMetaPoolDeposit"]
func.dependencies = ["SUSDMetaPoolTokens", "SUSDMetaPool"]
