import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const isSDLPaused = await read("SDL", "paused")

  // Ensure sdl is not paused
  if (isSDLPaused) {
    await execute("SDL", { from: deployer, log: true }, "enableTransfer")
  }
}
export default func
