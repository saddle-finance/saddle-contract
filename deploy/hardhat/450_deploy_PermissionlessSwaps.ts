import dotenv from "dotenv"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { PoolRegistry } from "../../build/typechain"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  dotenv.config()
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const permissionlessSwap = await getOrNull("PermissionlessSwapFlashLoan")
  const permissionlessMetaSwap = await getOrNull(
    "PermissionlessMetaSwapFlashLoan",
  )
  const permissionlessDeployer = await getOrNull("PermissionlessDeployer")
  const masterRegistryAddress = (await get("MasterRegistry")).address

  if (permissionlessSwap == null) {
    await deploy("PermissionlessSwapFlashLoan", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })
  }

  if (permissionlessMetaSwap == null) {
    await deploy("PermissionlessMetaSwapFlashLoan", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })
  }

  if (permissionlessDeployer == null) {
    await deploy("PermissionlessDeployer", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
        MULTISIG_ADDRESSES[await getChainId()],
        (await get("MasterRegistry")).address,
        (await get("LPToken")).address,
        (await get("PermissionlessSwapFlashLoan")).address,
        (await get("PermissionlessMetaSwapFlashLoan")).address,
        (await get("SaddleSUSDMetaPoolDeposit")).address,
      ],
    })

    await execute(
      "MasterRegistry",
      {
        from: deployer,
        log: true,
      },
      "addRegistry",
      ethers.utils.formatBytes32String("PermissionlessDeployer"),
      (
        await get("PermissionlessDeployer")
      ).address,
    )

    const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

    // 1. Grant COMMUNITY_MANAGER_ROLE to PermissionlessDeployer
    // 2. Grant COMMUNITY_MANAGER_ROLE to deployer account
    // 3. Grant DEFAULT_ADMIN_ROLE to Multisig on this chain
    const batchCall = [
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.COMMUNITY_MANAGER_ROLE(),
        (
          await get("PermissionlessDeployer")
        ).address,
      ),
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.COMMUNITY_MANAGER_ROLE(),
        deployer,
      ),
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.DEFAULT_ADMIN_ROLE(),
        MULTISIG_ADDRESSES[await getChainId()],
      ),
    ]

    const batchCallData = batchCall
      .map((x) => x.data)
      .filter((x): x is string => !!x)

    await execute(
      "PoolRegistry",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      true,
    )
  }
}
export default func
func.tags = ["PermissionlessSwaps"]
func.dependencies = [
  "SUSDMetaPoolDeposit",
  "LPToken",
  "SwapUtils",
  "MetaSwapUtils",
  "MasterRegistry",
  "PoolRegistry",
  "AmplificationUtils",
]
// func.skip = async (env) => (await env.getChainId()) == CHAIN_ID.MAINNET
