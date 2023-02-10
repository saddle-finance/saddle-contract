import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setEtherBalance, ZERO_ADDRESS } from "../../test/testUtils"
import { ANYCALL_ADDRESS } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log, save, read } = deployments
  const { deployer, crossChainDeployer } = await getNamedAccounts()

  if (process.env.HARDHAT_DEPLOY_FORK) {
    // set balance of cross chain deployer in forked network
    await setEtherBalance(crossChainDeployer, ethers.utils.parseEther("10000"))
  }

  // Set owners to deployer until all contracts are fully deployed
  const owner = deployer

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  // 0: Deploy RootGaugeFactory
  const rgf = await deploy("RootGaugeFactory", {
    ...xChainFactoryDeployOptions,
    args: [
      ZERO_ADDRESS, // AnyCallTranslator placeholder
      owner, // owner
    ],
  })

  // 1: Deploy Root Gauge
  const rootGauge = await deploy("RootGauge", {
    ...xChainFactoryDeployOptions,
    args: [
      (await get("SDL")).address,
      (await get("GaugeController")).address,
      (await get("Minter")).address,
    ],
  })
  expect(await read("RootGauge", "factory")).not.eq(ZERO_ADDRESS)

  // 2: Deploy ProxyAdmin to be used as admin of AnyCallTranslator
  const proxyAdmin = await deploy("ProxyAdmin", xChainFactoryDeployOptions)

  // 3: Deploy AnyCallTranslator as a logic contract
  const anyCallTranslatorLogic = await deploy("AnyCallTranslatorLogic", {
    ...xChainFactoryDeployOptions,
    contract: "AnyCallTranslator",
  })

  // Function data for AnyCallTranslator.initialize(multisigAddress, anyCallAddress)
  // This will be passed as 3rd parameter when intiaizing the proxy
  // and gets used as calldata for calling self.delegatecall(initializeCallData)
  const initData = await ethers
    .getContractFactory("AnyCallTranslator")
    .then((c) =>
      c.interface.encodeFunctionData("initialize", [owner, ANYCALL_ADDRESS]),
    )

  // 4: Deploy Proxy to be used as AnyCallTranslator
  const anyCallTranslatorProxy = await deploy("AnyCallTranslatorProxy", {
    ...xChainFactoryDeployOptions,
    contract: "TransparentUpgradeableProxy",
    args: [anyCallTranslatorLogic.address, proxyAdmin.address, initData],
  })

  // Save a reference to the proxy contract with the same abi as the logic contract
  await save("AnyCallTranslator", {
    abi: anyCallTranslatorLogic.abi,
    address: anyCallTranslatorProxy.address,
  })

  // 5: Deploy Root Oracle
  const rootOracle = await deploy("RootOracle", {
    ...xChainFactoryDeployOptions,
    args: [
      rgf.address,
      (await get("VotingEscrow")).address,
      anyCallTranslatorProxy.address,
    ],
  })

  // Set up storage variables in RootGaugeFactory from deployer account
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_implementation",
    rootGauge.address,
  )
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_call_proxy",
    anyCallTranslatorProxy.address,
  )

  // Add RootGaugeFactory to master registry
  await execute(
    "MasterRegistry",
    executeOptions,
    "addRegistry",
    ethers.utils.formatBytes32String("RootGaugeFactory"),
    rgf.address,
  )

  // Add RGF and RootOracle to addKnownCallers from owner
  await execute("AnyCallTranslator", executeOptions, "addKnownCallers", [
    rgf.address,
    rootOracle.address,
  ])
}
export default func
func.skip = async () => true
