import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect } from "chai"
import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { AnyCallExecutor, RootGaugeFactory } from "../../build/typechain"
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
  )
  const executorCreatorAddress = await executorContract.creator()
  const executorCreator = await impersonateAccount(executorCreatorAddress)
  await setEtherBalance(executorCreatorAddress, BIG_NUMBER_1E18.mul(10000))

  // Deploy a gauge for Arbitrum FraxBP
  const deployGaugeData = {
    chainId: BigNumber.from(CHAIN_ID.ARBITRUM_MAINNET),
    salt: convertGaugeNameToSalt("Arb FraxBP"),
    gaugeName: "Arb FraxBP",
  }

  // Get RootGaugeFactory contract and interface
  const rgf: RootGaugeFactory = await ethers.getContract("RootGaugeFactory")
  let callData = rgf.interface.encodeFunctionData("deploy_gauge", [
    deployGaugeData.chainId,
    deployGaugeData.salt,
    deployGaugeData.gaugeName,
  ])
  callData = ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [rgf.address, callData],
  )

  await expect(
    executorContract.connect(executorCreator).execute(
      anyCallTranslatorProxy.address,
      callData,
      anyCallTranslatorProxy.address, // Pretend the call came from same address from source chain
      CHAIN_ID.ARBITRUM_MAINNET, // Source chain ID
      0, // Source nonce
    ),
  )
    .to.emit(rgf, "DeployedGauge")
    .withArgs(
      anyValue,
      deployGaugeData.chainId,
      anyValue,
      deployGaugeData.salt,
      anyValue,
    )
}
export default func
