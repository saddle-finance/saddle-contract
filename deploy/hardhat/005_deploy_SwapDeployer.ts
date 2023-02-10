import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { isMainnet, isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, execute, read } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address
  const libraryDeployer = (await hre.ethers.getSigners())[1].address

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
