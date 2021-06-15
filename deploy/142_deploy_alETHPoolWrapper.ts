import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { get, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  await deploy("SaddleALETHPoolWrapper", {
    from: deployer,
    contract: "SwapEthWrapper",
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await get("WETH")).address, (await get("SaddleALETHPool")).address],
  })
}
export default func
func.tags = ["ALETHPoolWrapper"]
func.dependencies = ["ALETHPool"]
