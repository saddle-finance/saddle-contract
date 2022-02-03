import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  await deploy("MetaSwapDeposit", {
    from: libraryDeployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["MetaSwapDeposit"]
