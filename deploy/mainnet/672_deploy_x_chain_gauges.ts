import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { AnyCallExecutor } from "../../build/typechain"
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
  // Impersonate AnyCall.executor() and call AnyCallTranslatorProxy.anyExecute()
  // with correct calldata for creating a new child gauge
  // For testing purposes, we will create a cross chain gauge for SaddleFRAXBPPool
  const executorAddress = await ethers
    .getContractAt("MockAnyCall", ANYCALL_ADDRESS)
    .then((c) => c.executor())
  const executorContract: AnyCallExecutor = await ethers.getContractAt(
    "AnyCallExecutor",
    executorAddress,
  )
  const anyCallTranslatorProxy = await ethers.getContract(
    "AnyCallTranslatorProxy",
    ANYCALL_ADDRESS,
  )
  const executorCreatorAddress = await executorContract.creator()
  const executorCreator = await impersonateAccount(executorCreatorAddress)
  await setEtherBalance(executorCreatorAddress, BIG_NUMBER_1E18.mul(10000))

  // Deploy a gauge for Arbitrum FraxBP
  const deployGaugeData = {
    chainId: CHAIN_ID.ARBITRUM_MAINNET,
    salt: convertGaugeNameToSalt("Arb FraxBP"),
    gaugeName: "Arb FraxBP",
  }

  let callData = await ethers
    .getContractFactory("RootGaugeFactory")
    .then(async (c) =>
      c.interface.encodeFunctionData(
        "deploy_gauge",
        Object.values(deployGaugeData),
      ),
    )

  // Format additional calldata for calling AnyCallTranslatorProxy.anyExecute()
  callData = ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [(await get("RootGaugeFactory")).address, callData],
  )

  // Call anyExecute from impersonated executor account (owned by AnyCall)
  // Then confirm new gauge was deployed via event emitted by RootGaugeFactory
  await expect(
    executorContract.connect(executorCreator).execute(
      anyCallTranslatorProxy.address,
      callData,
      anyCallTranslatorProxy.address, // Pretend the call came from same address from source chain
      CHAIN_ID.ARBITRUM_MAINNET, // Source chain ID
      0, // Source nonce
    ),
  )
    .to.emit(await ethers.getContract("RootGaugeFactory"), "DeployedGauge")
    .withArgs(
      anyValue,
      deployGaugeData.chainId,
      anyValue,
      deployGaugeData.salt,
      anyValue,
    )
}
export default func
