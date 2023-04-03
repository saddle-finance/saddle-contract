import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, execute, getOrNull, log, get } = deployments
  const { libraryDeployer, deployer } = await getNamedAccounts()

  let lpTokenV2 = await getOrNull("LPTokenV2")
  if (lpTokenV2) {
    log(`reusing "LPToken" at ${lpTokenV2.address}`)
  } else {
    lpTokenV2 = await deploy("LPTokenV2", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "LPTokenV2",
      { from: libraryDeployer, log: true },
      "initialize",
      "Saddle LP Token (Target)",
      "saddleLPTokenTarget",
    )
  }

  let amplificationUtilsV2 = await getOrNull("AmplificationUtilsV2")
  if (amplificationUtilsV2) {
    log(`reusing "AmplificationUtilsV2" at ${amplificationUtilsV2.address}`)
  } else {
    amplificationUtilsV2 = await deploy("AmplificationUtilsV2", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  let swapUtilsV2 = await getOrNull("SwapUtilsV2")
  if (swapUtilsV2) {
    log(`reusing "SwapUtilsV2" at ${swapUtilsV2.address}`)
  } else {
    swapUtilsV2 = await deploy("SwapUtilsV2", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  let metaSwapUtilsV1 = await getOrNull("MetaSwapUtilsV1")
  if (metaSwapUtilsV1) {
    log(`reusing "MetaSwapUtilsV1" at ${metaSwapUtilsV1.address}`)
  } else {
    metaSwapUtilsV1 = await deploy("MetaSwapUtilsV1", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  let metaswapDepositV1 = await getOrNull("MetaSwapDepoistV1")
  if (metaswapDepositV1) {
    log(`reusing "MetaSwapUtilsV2" at ${metaswapDepositV1.address}`)
  } else {
    metaswapDepositV1 = await deploy("MetaSwapDepositV1", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  let permissionlessSwapV1 = await getOrNull("PermissionlessSwapV1")
  if (permissionlessSwapV1) {
    log(`reusing "PermissionlessSwapV1" at ${permissionlessSwapV1.address}`)
  } else {
    permissionlessSwapV1 = await deploy("PermissionlessSwapV1", {
      contract: "PermissionlessSwap",
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [(await get("MasterRegistry")).address],
      libraries: {
        SwapUtils: swapUtilsV2.address,
        AmplificationUtils: amplificationUtilsV2.address,
      },
    })
  }

  let permissionlessMetaSwapV1 = await getOrNull("PermissionlessMetaSwapV1")
  if (permissionlessMetaSwapV1) {
    log(
      `reusing "PermissionlessMetaSwapV1" at ${permissionlessMetaSwapV1.address}`,
    )
  } else {
    permissionlessMetaSwapV1 = await deploy("PermissionlessMetaSwapV1", {
      contract: "PermissionlessMetaSwap",
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [(await get("MasterRegistry")).address],
      libraries: {
        SwapUtils: swapUtilsV2.address,
        MetaSwapUtils: metaSwapUtilsV1.address,
        AmplificationUtils: amplificationUtilsV2.address,
      },
    })
  }
}
export default func
func.tags = [
  "LPTokenV2",
  "AmplificationUtilsV2",
  "SwapUtilsV2",
  "SwapV2",
  "SwapFlashLoanV1",
  "PermissionlessMetaSwapV1",
  "PermissionlessSwapV1",
  "MetaSwapUtilsV1",
  "MetaSwapDepositV1",
]
