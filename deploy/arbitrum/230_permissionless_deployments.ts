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

  const shareProtocolFee = await getOrNull("ShareProtocolFee")
  const permissionlessSwap = await getOrNull("PermissionlessSwap")
  const permissionlessMetaSwap = await getOrNull("PermissionlessMetaSwap")
  const permissionlessDeployer = await getOrNull("PermissionlessDeployer")

  // Get the MasterRegistry contract and address
  const masterRegistry: MasterRegistry = await ethers.getContract(
    "MasterRegistry",
    deployer,
  )
  const masterRegistryAddress = masterRegistry.address

  // see if master registry has a fee collector set
  const feeCollectorName =
    "0x466565436f6c6c6563746f720000000000000000000000000000000000000000"
  try {
    await masterRegistry.resolveNameToLatestAddress(feeCollectorName)
  } catch (error) {
    console.log("No fee collector set, setting now")
    await masterRegistry.addRegistry(
      feeCollectorName,
      MULTISIG_ADDRESSES[await getChainId()],
    )
    console.log("Successfully set fee collector")
  }

  // deploy ShareProtocolFeel if needed
  if (shareProtocolFee == null) {
    console.log("ShareProtocolFee not found, deploying")
    await deploy("ShareProtocolFee", {
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
      `ShareProtocolFee deployed at ${(await get("ShareProtocolFee")).address}`,
    )
  }

  // deploy PermissionlessSwap if needed
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
        ShareProtocolFee: (await get("ShareProtocolFee")).address,
      },
    })
    console.log(
      `PermissionlessSwap deployed at ${
        (await get("PermissionlessSwap")).address
      }`,
    )
  }

  // deploy ShareProtocolFeel if needed
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

  // deploy PermissionlessDeployer if needed
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
        (await get("PermissionlessSwap")).address,
        (await get("PermissionlessMetaSwap")).address,
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

    // set target swaps for the permissionless deployer,
    // PermissionlessDeployer to the master registry
    console.log("Setting target swaps for PermissionlessDeployer")
    console.log(
      `PermissionlessSwap at: ${(await get("PermissionlessSwap")).address}`,
    )
    console.log(
      `PermissionlessMetaSwap at: ${
        (await get("PermissionlessMetaSwap")).address
      }`,
    )
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

    console.log("Adding PermissionlessDeployer to MasterRegistry")
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
  "MasterRegistry",
  "PoolRegistry",
  "SwapUtils",
  "AmplificationUtils",
  "MetaSwapUtils",
  "LPToken",
]
// func.skip = async (env) => (await env.getChainId()) == CHAIN_ID.MAINNET
