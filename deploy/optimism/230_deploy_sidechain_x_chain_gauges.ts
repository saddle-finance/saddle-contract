import { tracer } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { AnyCallTranslator, AnyCallExecutor } from "../../build/typechain"
import {
  BIG_NUMBER_1E18,
  convertGaugeNameToSalt,
  impersonateAccount,
  setEtherBalance,
  ZERO_ADDRESS,
} from "../../test/testUtils"
import { ANYCALL_ADDRESS, PROD_DEPLOYER_ADDRESS } from "../../utils/accounts"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()

  // In prod, update these values
  const owner = deployer
  const crossChainDeployer = libraryDeployer

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
    skipIfAlreadyDeployed: true,
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  if (process.env.HARDHAT_DEPLOY_FORK) {
    // 0: Deploy ChildGaugeFactory
    const cgf = await deploy("ChildGaugeFactory", {
      ...xChainFactoryDeployOptions,
      args: [
        ZERO_ADDRESS, // AnyCallTranslator placeholder
        (
          await get("SDL")
        ).address, // SDL
        owner, // owner
      ],
    })

    // 1: Deploy Child Gauge
    const cg = await deploy("ChildGauge", {
      ...xChainFactoryDeployOptions,
      args: [(await get("SDL")).address, cgf.address],
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

    // 5: Deploy child oracle
    const co = await deploy("ChildOracle", {
      ...xChainFactoryDeployOptions,
      args: [anyCallTranslatorProxy.address],
    })

    // Set up storage variables in child gauge factory from deployer account
    await execute(
      "ChildGaugeFactory",
      executeOptions,
      "set_implementation",
      cg.address,
    )
    await execute(
      "ChildGaugeFactory",
      executeOptions,
      "set_voting_escrow",
      co.address,
    )
    await execute(
      "ChildGaugeFactory",
      executeOptions,
      "set_call_proxy",
      anyCallTranslatorProxy.address,
    )

    // Add to RootGaugeFactory to master registry
    const prodDeployer = await impersonateAccount(PROD_DEPLOYER_ADDRESS)
    await setEtherBalance(PROD_DEPLOYER_ADDRESS, BIG_NUMBER_1E18.mul(10000))
    const mr = await ethers.getContract("MasterRegistry")
    await mr
      .connect(prodDeployer)
      .addRegistry(
        ethers.utils.formatBytes32String("ChildGaugeFactory"),
        cgf.address,
      )

    // Add CGF to addKnownCallers from owner
    const anyCallTranslatorProxyContract: AnyCallTranslator = await ethers.getContractAt("AnyCallTranslator", anyCallTranslatorProxy.address)
    await anyCallTranslatorProxyContract.connect(await impersonateAccount(owner)).addKnownCallers([cgf.address])

    // Deploy a child gauge for testing
    // Impersonate AnyCall.executor() and call AnyCallTranslatorProxy.anyExecute()
    // with correct calldata for creating a new child gauge
    // For testing purposes, we will create a child gauge for SaddleFRAXBPPool
    const executorAddress = await ethers.getContractAt("MockAnyCall", ANYCALL_ADDRESS).then((c) => c.executor())
    const executorContract: AnyCallExecutor = await ethers.getContractAt("AnyCallExecutor", executorAddress)
    const executorCreatorAddress = await executorContract.creator()
    const executorCreator = await impersonateAccount(executorCreatorAddress)
    await setEtherBalance(executorCreatorAddress, BIG_NUMBER_1E18.mul(10000))

    // Format deploy_gauge call data that will be passed from RootGaugeFactory
    let callData = await ethers
      .getContractFactory("ChildGaugeFactory")
      .then(async (c) =>
        c.interface.encodeFunctionData("deploy_gauge(address,bytes32,string,address)",
        [
          (await get("SaddleFRAXBPPoolLPToken")).address, // LP token address
          convertGaugeNameToSalt("FraxBP X-Chain Gauge"), // salt
          "FraxBP X-Chain Gauge", // name
          deployer // manager of the gauge
        ]
          ),
      )
    
    // Format additional calldata for calling AnyCallTranslatorProxy.anyExecute()
    callData = ethers.utils.defaultAbiCoder.encode(
      ["address", "bytes"],
      [cgf.address, callData],
    )


    // Call anyExecute from impersonated executor account (owned by AnyCall)
    await executorContract.connect(executorCreator).execute(
      anyCallTranslatorProxy.address,
      callData,
      anyCallTranslatorProxy.address, // Pretend the call came from same address from source chain
      CHAIN_ID.MAINNET, // Source chain ID
      0, // Source nonce
    )
  } else {
    log(`Not running on forked mode, skipping`)
  }
}
export default func
