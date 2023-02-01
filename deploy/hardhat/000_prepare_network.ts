import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isMainnet } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, ethers } = hre
  const { log } = deployments

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
