import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const isSDLPaused = await read("SDL", "paused")

  // Ensure sdl is not paused
  if (isSDLPaused) {
    await execute("SDL", { from: deployer, log: true }, "enableTransfer")
  }
}
export default func
