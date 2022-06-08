import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { isMainnet, isTestNetwork } from "../../utils/network"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute, read } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()

  if (isTestNetwork(await getChainId())) {
    await deploy("SwapDeployerV1", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  await deploy("SwapDeployer", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  const currentOwner = await read("SwapDeployer", "owner")
  const chainId = await getChainId()

  if (isMainnet(chainId) && currentOwner != MULTISIG_ADDRESSES[chainId]) {
    await execute(
      "SwapDeployer",
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[chainId],
    )
  }
}
export default func
func.tags = ["SwapDeployer"]
