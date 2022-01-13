import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const metaPoolDeposit = await getOrNull("SaddleOptFRAXMetaPoolDeposit")
  if (metaPoolDeposit) {
    log(`reusing "SaddleOptFRAXMetaPoolDeposit" at ${metaPoolDeposit.address}`)
  } else {
    // This is the first time deploying MetaSwapDeposit contract.
    // Next time, we can just deploy a proxy that targets this.
    await deploy("SaddleOptFRAXMetaPoolDeposit", {
      from: deployer,
      log: true,
      contract: "MetaSwapDeposit",
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleOptFRAXMetaPoolDeposit",
      { from: deployer, log: true },
      "initialize",
      (
        await get("SaddleOptUSDPool")
      ).address,
      (
        await get("SaddleOptFRAXMetaPool")
      ).address,
      (
        await get("SaddleOptFRAXMetaPoolLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["SaddleOptFRAXMetaPoolDeposit"]
func.dependencies = ["SaddleOptFRAXMetaPoolTokens", "SaddleOptFRAXMetaPool"]
