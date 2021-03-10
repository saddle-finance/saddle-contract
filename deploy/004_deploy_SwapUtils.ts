import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute, get, getOrNull, log, read } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("SwapUtils", {
    from: deployer,
    log: true,
    libraries: {
      MathUtils: (await get("MathUtils")).address,
    },
  })
}
export default func
func.tags = ["SwapUtils"]
func.dependencies = ["MathUtils"]
