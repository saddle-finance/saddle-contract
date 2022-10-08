import dotenv from "dotenv"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MasterRegistry, PoolRegistry } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  dotenv.config()
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const permissionlessSwap = await getOrNull("PermissionlessSwap")
  const permissionlessMetaSwap = await getOrNull("PermissionlessMetaSwap")
  const permissionlessDeployer = await getOrNull("PermissionlessDeployer")
  const masterRegistry: MasterRegistry = await ethers.getContract(
    "MasterRegistry",
    deployer,
  )
  const masterRegistryAddress = masterRegistry.address
  const swapUtilsAddress = (await get("SwapUtils")).address
  const amplificationUtilsAddress = (await get("AmplificationUtils")).address

  // see if master registry has a fee collector set
  const feeCollectorName = ethers.utils.formatBytes32String("FeeCollector")
  console.log(feeCollectorName)
  console.log(
    "0x466565436f6c6c6563746f720000000000000000000000000000000000000000",
  )
  try {
    await masterRegistry.resolveNameToLatestAddress(feeCollectorName)
  } catch (error) {
    console.log("No fee collector set, setting now")
    // setting as the deployer for now as no multisig is available on this network
    await masterRegistry.addRegistry(feeCollectorName, deployer)
    console.log("Successfully set fee collector")
  }

  // deploy PermissionlessSwap if needed
  if (permissionlessSwap == null) {
    console.log("PermissionlessSwap not found, deploying")
    const permissionlessSwapDeployment = await deploy("PermissionlessSwap", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: swapUtilsAddress,
        AmplificationUtils: amplificationUtilsAddress,
      },
    })
    console.log(
      `PermissionlessSwap deployed at ${permissionlessSwapDeployment.address}`,
    )
  }
  const permissionlessSwapAddress = (await get("PermissionlessSwap")).address

  // deploy PermissionlessMetaSwap if needed
  if (permissionlessMetaSwap == null) {
    console.log("PermissionlessMetaSwap not found, deploying")
    const permissionlessMetaSwapDeployment = await deploy(
      "PermissionlessMetaSwap",
      {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: true,
        args: [masterRegistryAddress],
        libraries: {
          SwapUtils: swapUtilsAddress,
          MetaSwapUtils: (await get("MetaSwapUtils")).address,
          AmplificationUtils: amplificationUtilsAddress,
        },
      },
    )
    console.log(
      `PermissionlessMetaSwap deployed at ${permissionlessMetaSwapDeployment.address}`,
    )
  }
  const permissionlessMetaSwapAddress = (await get("PermissionlessMetaSwap"))
    .address

  // deploy PermissionlessDeployer if needed
  if (permissionlessDeployer == null) {
    console.log("PermissionlessDeployer not found, deploying")
    const PermissionlessDeployerDeployment = await deploy(
      "PermissionlessDeployer",
      {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: true,
        args: [
          deployer,
          masterRegistryAddress,
          (await get("LPToken")).address,
          permissionlessSwapAddress,
          permissionlessMetaSwapAddress,
          // Below needs to be a non-clone instance of the MetaswapDeposit Contract
          (
            await get("SaddleTBTCMetaPoolDeposit")
          ).address,
        ],
      },
    )
    console.log(
      `Deployed PermissionlessDeployer at ${PermissionlessDeployerDeployment.address}`,
    )

    // set target swaps for the permissionless deployer,
    // PermissionlessDeployer to the master registry
    console.log("Setting target swaps for PermissionlessDeployer")
    console.log(`PermissionlessSwap at: ${permissionlessSwapAddress}`)
    console.log(`PermissionlessMetaSwap at: ${permissionlessMetaSwapAddress}`)
    await execute(
      "PermissionlessDeployer",
      { from: deployer, log: true },
      "setTargetSwap",
      permissionlessSwapAddress,
    )

    await execute(
      "PermissionlessDeployer",
      { from: deployer, log: true },
      "setTargetMetaSwap",
      permissionlessMetaSwapAddress,
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
      PermissionlessDeployerDeployment.address,
    )

    const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

    // 1. Grant COMMUNITY_MANAGER_ROLE to PermissionlessDeployer
    // 2. Grant COMMUNITY_MANAGER_ROLE to deployer account
    // 3. Grant DEFAULT_ADMIN_ROLE to Multisig on this chain
    const batchCall = [
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.COMMUNITY_MANAGER_ROLE(),
        PermissionlessDeployerDeployment.address,
      ),
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.COMMUNITY_MANAGER_ROLE(),
        deployer,
      ),
      await poolRegistry.populateTransaction.grantRole(
        await poolRegistry.DEFAULT_ADMIN_ROLE(),
        deployer,
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
