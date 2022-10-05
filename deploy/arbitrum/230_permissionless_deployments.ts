import dotenv from "dotenv"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MasterRegistry, PoolRegistry } from "../../build/typechain"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  dotenv.config()
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry = await getOrNull("PoolRegistry")
  const masterRegistry = await getOrNull("MasterRegistry")
  const permissionlessSwap = await getOrNull("PermissionlessSwap")
  const permissionlessMetaSwap = await getOrNull("PermissionlessMetaSwap")
  const permissionlessDeployer = await getOrNull("PermissionlessDeployer")

  // If not deployed deploy pool registry
  if (poolRegistry == null) {
    console.log("PoolRegistry not found, deploying")
    await deploy("PoolRegistry", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [deployer, MULTISIG_ADDRESSES[await getChainId()]],
    })
    console.log(
      `PoolRegistry deployed at ${(await get("PoolRegistry")).address}`,
    )
  }

  // If not deployed deploy master registry
  if (masterRegistry == null) {
    console.log("MasterRegistry not found, deploying")
    await deploy("MasterRegistry", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [MULTISIG_ADDRESSES[await getChainId()]],
    })

    let masterRegistry = (await ethers.getContract(
      "MasterRegistry",
    )) as MasterRegistry
    console.log(`MasterRegistry deployed at ${masterRegistry.address}`)

    const batchCall = [
      await masterRegistry.populateTransaction.addRegistry(
        ethers.utils.formatBytes32String("PoolRegistry"),
        (
          await get("PoolRegistry")
        ).address,
      ),
      await masterRegistry.populateTransaction.addRegistry(
        ethers.utils.formatBytes32String("FeeCollector"),
        MULTISIG_ADDRESSES[await getChainId()],
      ),
    ]

    const batchCallData = batchCall
      .map((x) => x.data)
      .filter((x): x is string => !!x)

    await execute(
      "MasterRegistry",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      true,
    )
  }

  const masterRegistryAddress = (await get("MasterRegistry")).address

  if (permissionlessSwap == null) {
    console.log("PermissionlessSwap not found, deploying")
    await deploy("PermissionlessSwap", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })
    console.log(
      `PermissionlessSwap deployed at ${
        (await get("PermissionlessSwap")).address
      }`,
    )
  }

  if (permissionlessMetaSwap == null) {
    console.log("PermissionlessMetaSwap not found, deploying")
    await deploy("PermissionlessMetaSwap", {
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
    console.log(
      `PermissionlessMetaSwap deployed at ${
        (await get("PermissionlessMetaSwap")).address
      }`,
    )
  }

  if (permissionlessDeployer == null) {
    console.log("PermissionlessDeployer not found, deploying")
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
        // Below needs to be a non-clone instance of the MetaswapDeposit Contract
        (
          await get("MetaSwapDeposit")
        ).address,
      ],
    })
    console.log(
      `Deployed PermissionlessDeployer at ${
        (await get("PermissionlessDeployer")).address
      }`,
    )

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
// func.skip = async (env) => (await env.getChainId()) == CHAIN_ID.MAINNET
