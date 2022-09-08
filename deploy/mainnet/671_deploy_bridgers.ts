import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"

import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()

  if (process.env.HARDHAT_DEPLOY_FORK == null) {
    log(`Not running on forked mode, skipping ${path.basename(__filename)}`)
    return
  }

  // In prod, update these values
  const owner = deployer
  const crossChainDeployer = libraryDeployer

  const deployOptions = {
    log: true,
    from: deployer,
    skipIfAlreadyDeployed: true,
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  const gasLimit = 1000000
  const gasPrice = 990000000
  const maxSubmissionCost = 10000000000000

  // Deploy Arbitrum Bridger
  await deploy("ArbitrumBridger", {
    ...deployOptions,
    args: [gasLimit, gasPrice, maxSubmissionCost, (await get("SDL")).address],
  })

  // Set Bridger
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_bridger",
    CHAIN_ID.ARBITRUM_MAINNET,
    (
      await get("ArbitrumBridger")
    ).address,
  )

  // Impersonate AnyCall.executor() and call AnyCallTranslatorProxy.anyExecute()
  // with correct calldata for creating a new child gauge
  // For testing purposes, we will create a child gauge for SaddleFRAXBPPool

  // const executorAddress = await ethers
  //   .getContractAt("MockAnyCall", ANYCALL_ADDRESS)
  //   .then((c) => c.executor())
  // const executorContract: AnyCallExecutor = await ethers.getContractAt(
  //   "AnyCallExecutor",
  //   executorAddress,
  // )
  // const executorCreatorAddress = await executorContract.creator()
  // const executorCreator = await impersonateAccount(executorCreatorAddress)
  // await setEtherBalance(executorCreatorAddress, BIG_NUMBER_1E18.mul(10000))

  // // Format deploy_gauge call data that will be passed from RootGaugeFactory
  // const callData = await ethers
  //   .getContractFactory("ChildGaugeFactory")
  //   .then(async (c) =>
  //     c.interface.encodeFunctionData(
  //       "deploy_gauge(address,bytes32,string,address)",
  //       [
  //         (
  //           await get("SaddleFRAXBPPoolLPToken")
  //         ).address, // LP token address
  //         convertGaugeNameToSalt("FraxBP X-Chain Gauge"), // salt
  //         "FraxBP X-Chain Gauge", // name
  //         deployer, // manager of the gauge
  //       ],
  //     ),
  //   )

  // // Format additional calldata for calling AnyCallTranslatorProxy.anyExecute()
  // callData = ethers.utils.defaultAbiCoder.encode(
  //   ["address", "bytes"],
  //   [rgf.address, callData],
  // )

  // // Call anyExecute from impersonated executor account (owned by AnyCall)
  // await executorContract.connect(executorCreator).execute(
  //   anyCallTranslatorProxy.address,
  //   callData,
  //   anyCallTranslatorProxy.address, // Pretend the call came from same address from source chain
  //   CHAIN_ID.MAINNET, // Source chain ID
  //   0, // Source nonce
  // )
}
export default func
