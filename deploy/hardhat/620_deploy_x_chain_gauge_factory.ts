import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { RootGaugeFactory } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()

  const mockBridger = await deploy("MockBridger", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  const mockAnyCall = await deploy("MockAnyCall", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  const anyCallTranslator = await deploy("AnyCallTranslator", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [deployer, mockAnyCall.address],
  })

  const rgf = await deploy("RootGaugeFactory", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [anyCallTranslator.address, deployer],
  })

  const rootGaugeImpl = await deploy("RootGauge", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("SDL")).address,
      (await get("GaugeController")).address,
      (await get("Minter")).address,
    ],
  })

  // Add to RootGaugeFactory to master registry
  await execute(
    "MasterRegistry",
    {
      from: deployer,
      log: true,
    },
    "addRegistry",
    ethers.utils.formatBytes32String("RootGaugeFactory"),
    rgf.address,
  )

  // Update RootGaugeFactory bridger for chainId 11, set call proxy, set implementation
  await execute(
    "RootGaugeFactory",
    {
      from: deployer,
      log: true,
    },
    "set_bridger",
    11,
    mockBridger.address,
  )
  await execute(
    "RootGaugeFactory",
    {
      from: deployer,
      log: true,
    },
    "set_call_proxy",
    mockAnyCall.address,
  )
  await execute(
    "RootGaugeFactory",
    {
      from: deployer,
      log: true,
    },
    "set_implementation",
    rootGaugeImpl.address,
  )

  // Deploy a root gauge with name "Sample_Name" @ chainId 11 for testing
  await execute(
    "RootGaugeFactory",
    {
      from: deployer,
      log: true,
      gasLimit: 500000, // 353411 gas expected
    },
    "deploy_gauge",
    11,
    ethers.utils.keccak256(ethers.utils.formatBytes32String("Sample_Name")),
    "Sample_Name",
  )
}

export default func
func.dependencies = ["veSDL"]
func.tags = ["CrossChaingGauges"]
