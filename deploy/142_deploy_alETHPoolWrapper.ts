import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESS } from "../utils/accounts"
import { isTestNetwork } from "../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { get, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const ownerAddress = isTestNetwork(await getChainId())
    ? deployer
    : MULTISIG_ADDRESS

  // Manually check if the pool is already deployed
  await deploy("SaddleALETHPoolWrapper", {
    from: deployer,
    contract: "SwapEthWrapper",
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("WETH")).address,
      (await get("SaddleALETHPool")).address,
      ownerAddress,
    ],
  })
}
export default func
func.tags = ["ALETHPoolWrapper"]
func.dependencies = ["ALETHPool"]
