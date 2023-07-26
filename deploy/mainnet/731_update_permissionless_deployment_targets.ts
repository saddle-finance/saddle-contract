import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers } from "hardhat"
import { PermissionlessDeployer } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, log, get } = deployments
  const { deployer } = await getNamedAccounts()

  const permissionlessSwapV1 = await get("PermissionlessSwapV1")
  const permissionlessMetaSwapV1 = await get("PermissionlessMetaSwapV1")
  const lpTokenV2 = await get("LPTokenV2")
  const metaswapDepositV1 = await get("MetaSwapDepositV1")

  const permissionlessDeployer: PermissionlessDeployer =
    (await ethers.getContract(
      "PermissionlessDeployer",
    )) as PermissionlessDeployer
  if (
    await permissionlessDeployer.hasRole(
      await permissionlessDeployer.SADDLE_MANAGER_ROLE(),
      deployer,
    )
  ) {
    // If LPTokenV2 is not already set as the target LPToken, set it
    const targetLPToken = await permissionlessDeployer.targetLPToken()
    if (targetLPToken != lpTokenV2.address) {
      await execute(
        "PermissionlessDeployer",
        { from: deployer, log: true },
        "setTargetLPToken",
        lpTokenV2.address,
      )
    }
    // If PermissionlessSwapV1 is not already set as the target Swap, set it
    const targetSwap = await permissionlessDeployer.targetSwap()
    if (targetSwap != permissionlessSwapV1.address) {
      await execute(
        "PermissionlessDeployer",
        { from: deployer, log: true },
        "setTargetSwap",
        permissionlessSwapV1.address,
      )
    }
    // If PermissionlessMetaSwapV1 is not already set as the target MetaSwap, set it
    const targetMetaSwap = await permissionlessDeployer.targetMetaSwap()
    if (targetMetaSwap != permissionlessMetaSwapV1.address) {
      await execute(
        "PermissionlessDeployer",
        { from: deployer, log: true },
        "setTargetMetaSwap",
        permissionlessMetaSwapV1.address,
      )
    }
    // If MetaSwapDepoistV1 is not already set as the target MetaSwapDeposit, set it
    const targetMetaSwapDeposit =
      await permissionlessDeployer.targetMetaSwapDeposit()
    if (targetMetaSwapDeposit != metaswapDepositV1.address) {
      await execute(
        "PermissionlessDeployer",
        { from: deployer, log: true },
        "setTargetMetaSwapDeposit",
        metaswapDepositV1.address,
      )
    }
  } else {
    const targetSwap = await permissionlessDeployer.targetSwap()
    const targetMetaSwap = await permissionlessDeployer.targetMetaSwap()
    if (
      targetSwap != permissionlessSwapV1.address ||
      targetMetaSwap != permissionlessMetaSwapV1.address
    ) {
      log(
        `PermissionlessDeployer targets are out of date, must be updated by multisig`,
      )
      const manager = await permissionlessDeployer.getRoleMember(
        await permissionlessDeployer.SADDLE_MANAGER_ROLE(),
        0,
      )
      log(`Currnet manager is ${manager}`)
    }
  }
}
export default func
func.dependencies = [
  "LPTokenV2",
  "AmplificationUtilsV2",
  "SwapUtilsV2",
  "SwapV2",
  "SwapFlashLoanV1",
  "PermissionlessMetaSwapV1",
  "PermissionlessSwapV1",
  "MetaSwapUtilsV1",
  "MetaSwapDepoistV1",
]
