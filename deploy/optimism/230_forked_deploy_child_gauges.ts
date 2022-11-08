import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { AnyCallExecutor, ChildGaugeFactory } from "../../build/typechain"
import {
  BIG_NUMBER_1E18,
  convertGaugeNameToSalt,
  impersonateAccount,
  setEtherBalance,
} from "../../test/testUtils"
import { ANYCALL_ADDRESS } from "../../utils/accounts"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log, save } = deployments
  const { deployer, crossChainDeployer } = await getNamedAccounts()

  if (process.env.HARDHAT_DEPLOY_FORK == null) {
    log(`Not running on forked mode, skipping ${path.basename(__filename)}`)
    return
  }

  // set owner as deployer until all contracts are deployed
  const owner = deployer

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  const cgf = (await ethers.getContract(
    "ChildGaugeFactory",
  )) as ChildGaugeFactory

  const anyCallTranslator = await ethers.getContract("AnyCallTranslator")

  // Deploy a child gauge for testing
  // Impersonate AnyCall.executor() and call AnyCallTranslatorProxy.anyExecute()
  // with correct calldata for creating a new child gauge
  // For testing purposes, we will create a child gauge for SaddleFRAXBPPool
  const executorAddress = await ethers
    .getContractAt("MockAnyCall", ANYCALL_ADDRESS)
    .then((c) => c.executor())
  const executorContract: AnyCallExecutor = await ethers.getContractAt(
    "AnyCallExecutor",
    executorAddress,
  )
  const executorCreatorAddress = await executorContract.creator()
  const executorCreator = await impersonateAccount(executorCreatorAddress)
  await setEtherBalance(executorCreatorAddress, BIG_NUMBER_1E18.mul(10000))

  // Format deploy_gauge call data that will be passed from RootGaugeFactory
  let callData = await ethers
    .getContractFactory("ChildGaugeFactory")
    .then(async (c) =>
      c.interface.encodeFunctionData(
        "deploy_gauge(address,bytes32,string,address)",
        [
          (
            await get("SaddleFRAXBPPoolLPToken")
          ).address, // LP token address
          convertGaugeNameToSalt("FraxBP X-Chain Gauge"), // salt
          "FraxBP X-Chain Gauge", // name
          deployer, // manager of the gauge
        ],
      ),
    )

  // Format additional calldata for calling AnyCallTranslatorProxy.anyExecute()
  callData = ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [cgf.address, callData],
  )

  // Call anyExecute from impersonated executor account (owned by AnyCall)
  await executorContract.connect(executorCreator).execute(
    anyCallTranslator.address,
    callData,
    anyCallTranslator.address, // Pretend the call came from same address from source chain
    CHAIN_ID.MAINNET, // Source chain ID
    0, // Source nonce
  )

  const cgfContract: ChildGaugeFactory = await ethers.getContractAt(
    "ChildGaugeFactory",
    cgf.address,
  )

  await save("ChildGauge-SaddleFRAXBPPoolLPToken", {
    abi: (await get("ChildGauge")).abi,
    address: await cgfContract.get_gauge_from_lp_token(
      (
        await get("SaddleFRAXBPPoolLPToken")
      ).address,
    ),
  })
}
export default func
