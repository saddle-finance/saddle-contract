import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
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
  const testAccountAddress = await getHardhatTestSigners()[0].getAddress()

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
  await setEtherBalance(testAccountAddress, BIG_NUMBER_1E18.mul(10000))

  const childOracle: ChildOracle = await ethers.getContract("ChildOracle")

  // Format recieve() call data
  let callData = childOracle.interface.encodeFunctionData("recieve", [
    // User point
    {
      bias: "5292272140402369232160848",
      slope: "42041442901583344",
      ts: "1663116133",
    },
    // Global point
    {
      bias: "39021498196781652278562539",
      slope: "518420477278521359",
      ts: "1663732379",
    },
    // Address to save the User point data for
    testAccountAddress,
  ])
  // Format additional calldata for calling AnyCallTranslatorProxy.anyExecute()
  callData = ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [childOracle.address, callData],
  )

  // Call anyExecute from impersonated executor account (owned by AnyCall)
  await executorContract.connect(executorCreator).execute(
    translatorProxy.address,
    callData,
    translatorProxy.address, // Pretend the call came from same address from source chain
    CHAIN_ID.MAINNET, // Source chain ID
    0, // Source nonce
  )

  // Check that ChildOracle has received the data correctly
  const balance = await childOracle.balanceOf(testAccountAddress)
  expect(await childOracle.balanceOf(testAccountAddress)).to.be.gt(0)
  expect(await childOracle.totalSupply()).to.be.gt(0)
  log(
    `ChildOracle received data correctly, ${testAccountAddress} veSDL balance: ${balance}`,
  )
}
export default func
