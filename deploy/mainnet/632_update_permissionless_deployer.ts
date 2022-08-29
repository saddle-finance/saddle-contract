import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, log, execute } = deployments
  const { deployer } = await getNamedAccounts()

  await execute(
    "PermissionlessDeployer",
    { from: deployer, log: true },
    "setTargetSwap",
    (
      await get("PermissionlessSwap")
    ).address,
  )

  await execute(
    "PermissionlessDeployer",
    { from: deployer, log: true },
    "setTargetMetaSwap",
    (
      await get("PermissionlessMetaSwap")
    ).address,
  )

  await execute(
    "PermissionlessDeployer",
    { from: deployer, log: true },
    "setTargetMetaSwapDeposit",
    (
      await get("SaddleFRAXalUSDMetaPoolDeposit")
    ).address,
  )
}
export default func
func.skip = async () => true
