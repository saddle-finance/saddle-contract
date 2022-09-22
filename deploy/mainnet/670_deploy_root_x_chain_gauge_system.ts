import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { AnyCallTranslator } from "../../build/typechain"
import {
  BIG_NUMBER_1E18,
  impersonateAccount,
  setEtherBalance,
  ZERO_ADDRESS,
} from "../../test/testUtils"
import { ANYCALL_ADDRESS, PROD_DEPLOYER_ADDRESS } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log } = deployments
  const { deployer } = await getNamedAccounts()

  if (process.env.HARDHAT_DEPLOY_FORK == null) {
    log(`Not running on forked mode, skipping ${path.basename(__filename)}`)
    return
  }

  // In prod, update these values
  const owner = deployer
  const crossChainDeployer = deployer

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
    skipIfAlreadyDeployed: true,
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

  // 2: Deploy ProxyAdmin to be used as admin of AnyCallTranslator
  const proxyAdmin = await deploy("ProxyAdmin", xChainFactoryDeployOptions)

  // 3: Deploy AnyCallTranslator as a logic contract
  const anyCallTranslatorLogic = await deploy(
    "AnyCallTranslator",
    xChainFactoryDeployOptions,
  )

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
  const prodDeployer = await impersonateAccount(PROD_DEPLOYER_ADDRESS)
  await setEtherBalance(PROD_DEPLOYER_ADDRESS, BIG_NUMBER_1E18.mul(10000))
  const mr = await ethers.getContract("MasterRegistry")
  await mr
    .connect(prodDeployer)
    .addRegistry(
      ethers.utils.formatBytes32String("RootGaugeFactory"),
      rgf.address,
    )

  // Add RGF and RootOracle to addKnownCallers from owner
  const anyCallTranslatorProxyContract: AnyCallTranslator =
    await ethers.getContractAt(
      "AnyCallTranslator",
      anyCallTranslatorProxy.address,
    )
  await anyCallTranslatorProxyContract
    .connect(await impersonateAccount(owner))
    .addKnownCallers([rgf.address, rootOracle.address])
}
export default func
