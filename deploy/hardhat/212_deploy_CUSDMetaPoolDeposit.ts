import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const saddleWCUSDMetaPool = await getOrNull("SaddleWCUSDMetaPoolDeposit")
  if (saddleWCUSDMetaPool) {
    log(
      `reusing "SaddleWCUSDMetaPoolDeposit" at ${saddleWCUSDMetaPool.address}`,
    )
  } else {
    await deploy("SaddleWCUSDMetaPoolDeposit", {
      from: deployer,
      log: true,
      contract: "MetaSwapDeposit",
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleWCUSDMetaPoolDeposit",
      { from: deployer, log: true },
      "initialize",
      (
        await get("SaddleUSDPoolV2")
      ).address,
      (
        await get("SaddleWCUSDMetaPool")
      ).address,
      (
        await get("SaddleWCUSDMetaPoolLPToken")
      ).address,
    )
  }
}
export default func
func.tags = ["WCUSDMetaPoolDeposit"]
func.dependencies = ["WCUSDMetaPoolTokens", "WCUSDMetaPool"]
