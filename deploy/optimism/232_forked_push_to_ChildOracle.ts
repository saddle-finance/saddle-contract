import { expect } from "chai"
import { Address, DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { AnyCallExecutor, ChildOracle } from "../../build/typechain"
import { getHardhatTestSigners } from "../../scripts/utils"
import {
  BIG_NUMBER_1E18,
  impersonateAccount,
  setEtherBalance,
} from "../../test/testUtils"
import { ANYCALL_ADDRESS } from "../../utils/accounts"
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

  // Skip this script if not running on forked mode
  if (process.env.HARDHAT_DEPLOY_FORK == null) {
    log(`Not running on forked mode, skipping ${path.basename(__filename)}`)
    return
  }

  const translatorProxy = await get("AnyCallTranslatorProxy")
  const childOracle: ChildOracle = await ethers.getContract("ChildOracle")
  const hardhatAccount0 = await getHardhatTestSigners()[0].getAddress()
  const hardhatAccount1 = await getHardhatTestSigners()[1].getAddress()

  // Trigger `ChildOracle.receive()` by calling
  // `AnyCallExecutor.execute()` from the executor contract creator
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

  // User point for hardhat account[0]
  const userPoint0 = {
    bias: "5292272140402369232160848",
    slope: "42041442901583344",
    ts: "1663116133",
  }
  // User point for hardhat account[1]
  const userPoint1 = {
    bias: "1067529802746270691066436",
    slope: "33942146860064543",
    ts: "1659569348",
  }
  // Global point for total supply of veSDL
  const globalPoint = {
    bias: "39021498196781652278562539",
    slope: "518420477278521359",
    ts: "1663732379",
  }

  // Call anyExecute from impersonated executor account (owned by AnyCall)
  // Trigger receive for hardhat account[0]
  await executorContract.connect(executorCreator).execute(
    translatorProxy.address,
    formatReceiveCalldata(
      hre,
      childOracle,
      userPoint0,
      globalPoint,
      hardhatAccount0,
    ),
    translatorProxy.address, // Pretend the call came from same address from source chain
    CHAIN_ID.MAINNET, // Source chain ID
    0, // Source nonce
  )

  // Trigger receive for hardhat account[1]
  await executorContract.connect(executorCreator).execute(
    translatorProxy.address,
    formatReceiveCalldata(
      hre,
      childOracle,
      userPoint1,
      globalPoint,
      hardhatAccount1,
    ),
    translatorProxy.address, // Pretend the call came from same address from source chain
    CHAIN_ID.MAINNET, // Source chain ID
    0, // Source nonce
  )

  // Check that ChildOracle has received the data correctly
  const balance0 = await childOracle.balanceOf(hardhatAccount0)
  const balance1 = await childOracle.balanceOf(hardhatAccount1)
  expect(await childOracle.balanceOf(hardhatAccount0)).to.be.gt(0)
  expect(await childOracle.balanceOf(hardhatAccount1)).to.be.gt(0)
  expect(await childOracle.totalSupply()).to.be.gt(0)

  // Log the balances for debugging
  log(
    `ChildOracle received data correctly, ${hardhatAccount0} veSDL balance: ${balance0}`,
  )
  log(
    `ChildOracle received data correctly, ${hardhatAccount1} veSDL balance: ${balance1}`,
  )
}

// Helper function to format calldata for receive function
function formatReceiveCalldata(
  hre: HardhatRuntimeEnvironment,
  childOracle: ChildOracle,
  userPoint: ChildOracle.PointStruct,
  globalPoint: ChildOracle.PointStruct,
  userAddress: Address,
) {
  // Format receive() call data
  const callData = childOracle.interface.encodeFunctionData("receive", [
    // User point
    userPoint,
    // Global point
    globalPoint,
    // Address to save the User point data for
    userAddress,
  ])
  // Format additional calldata for calling AnyCallTranslatorProxy.anyExecute()
  return hre.ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [childOracle.address, callData],
  )
}

export default func
func.skip = async () => true
