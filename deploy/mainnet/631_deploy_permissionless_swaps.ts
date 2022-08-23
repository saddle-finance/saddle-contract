import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

/*
 * Deploys non-flashloan versions of permissionless swaps
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, log, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const masterRegistryAddress = (await get("MasterRegistry")).address

  await deploy("PermissionlessSwap", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    libraries: {
      SwapUtils: (await get("SwapUtils")).address,
      AmplificationUtils: (await get("AmplificationUtils")).address,
    },
    args: [masterRegistryAddress],
  })

  await deploy("PermissionlessMetaSwap", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    libraries: {
      SwapUtils: (await get("SwapUtils")).address,
      AmplificationUtils: (await get("AmplificationUtils")).address,
      MetaSwapUtils: (await get("MetaSwapUtils")).address,
    },
    args: [masterRegistryAddress],
  })
}
export default func
