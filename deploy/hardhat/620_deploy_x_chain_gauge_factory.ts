import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { increaseTimestamp } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address
  const libraryDeployer = (await hre.ethers.getSigners())[1].address

  const deployOptions = {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  }
  const executeOptions = {
    from: deployer,
    log: true,
  }

  const mockBridger = await deploy("MockBridger", deployOptions)
  const mockAnyCall = await deploy("MockAnyCall", deployOptions)
  const anyCallTranslatorLogic = await deploy(
    "AnyCallTranslator",
    deployOptions,
  )
  const proxyAdmin = await deploy("ProxyAdmin", deployOptions)

  const initializeCallData = (
    await ethers
      .getContractAt("AnyCallTranslator", anyCallTranslatorLogic.address)
      .then((c) =>
        c.populateTransaction.initialize(deployer, mockAnyCall.address),
      )
  ).data as string

  const translatorProxy = await deploy("TransparentUpgradeableProxy", {
    ...deployOptions,
    args: [
      anyCallTranslatorLogic.address, // implementation
      proxyAdmin.address, // admin
      initializeCallData, // initialize data
    ],
  })

  const rgf = await deploy("RootGaugeFactory", {
    ...deployOptions,
    args: [translatorProxy.address, deployer],
  })

  const rootGaugeImpl = await deploy("RootGauge", {
    ...deployOptions,
    args: [
      (await get("SDL")).address,
      (await get("GaugeController")).address,
      (await get("Minter")).address,
    ],
  })

  // Add to RootGaugeFactory to master registry
  await execute(
    "MasterRegistry",
    executeOptions,
    "addRegistry",
    ethers.utils.formatBytes32String("RootGaugeFactory"),
    rgf.address,
  )

  // Update RootGaugeFactory bridger for chainId 11, set call proxy, set implementation
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_bridger",
    11,
    mockBridger.address,
  )
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_call_proxy",
    translatorProxy.address,
  )
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_implementation",
    rootGaugeImpl.address,
  )

  // Deploy a root gauge with name "Sample_Name" @ chainId 11 for testing
  // But do not add to gauge controller
  await execute(
    "RootGaugeFactory",
    {
      ...executeOptions,
      gasLimit: 500000, // 353411 gas expected
    },
    "deploy_gauge",
    11,
    ethers.utils.keccak256(ethers.utils.formatBytes32String("Sample_Name")),
    "Sample_Name",
  )

  // Deploy a root gauge with name "Sample_Name_2" @ chainId 11 for testing
  await execute(
    "RootGaugeFactory",
    {
      ...executeOptions,
      gasLimit: 500000, // 353411 gas expected
    },
    "deploy_gauge",
    11,
    ethers.utils.keccak256(ethers.utils.formatBytes32String("Sample_Name_2")),
    "Sample_Name_2",
  )
  const deployedGauge = await read("RootGaugeFactory", "get_gauge", 11, 1)

  await execute(
    "GaugeController",
    executeOptions,
    "add_gauge(address,int128,uint256)",
    deployedGauge,
    1,
    100,
  )

  // Skip a week to apply the new weights
  await increaseTimestamp(86400 * 7)
}

export default func
func.dependencies = ["veSDL"]
func.tags = ["CrossChaingGauges"]
