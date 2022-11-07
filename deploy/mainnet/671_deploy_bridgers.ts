import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { getWithName } from "../../test/testUtils"

import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log, read } = deployments
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
  const sdlAddress = (await get("SDL")).address

  // Deploy Arbitrum Bridger
  await deploy("ArbitrumBridger", {
    ...deployOptions,
    args: [gasLimit, gasPrice, sdlAddress],
  })

  // Get Optimism SDL address
  const sdlAddressOnOpt = (await getWithName("SDL", "optimism_mainnet")).address

  await deploy("OptimismBridger", {
    ...deployOptions,
    args: [200_000, sdlAddress, sdlAddressOnOpt],
  })

  // Set Bridgers
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_bridger",
    CHAIN_ID.ARBITRUM_MAINNET,
    (
      await get("ArbitrumBridger")
    ).address,
  )

  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_bridger",
    CHAIN_ID.OPTIMISM_MAINNET,
    (
      await get("OptimismBridger")
    ).address,
  )
}
export default func