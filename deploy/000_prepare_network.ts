import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { isMainnet } from "../utils/network"
import dotenv from "dotenv"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  dotenv.config()

  if (isMainnet(await getChainId()) && process.env.FORK_MAINNET === "true") {
    if (
      process.env.RESET_BASE_FEE_PER_GAS == null ||
      process.env.RESET_BASE_FEE_PER_GAS === "true"
    ) {
      log(`Resetting the base fee per gas to 1 gwei...`)
      await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", [
        "0x3B9ACA00",
      ])
    } else {
      log(`Keeping the base fee per gas...`)
    }
  }
}
export default func
func.tags = ["SetupNetwork"]
