import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, network } = hre
  const { log } = deployments

  if (
    (await getChainId()) === CHAIN_ID.AURORA_MAINNET &&
    network.name !== "hardhat"
  ) {
    try {
      await hre.run("etherscan-verify", {
        apiKey: process.env.ETHERSCAN_AURORA_API,
      })
    } catch (e) {
      log(e)
    }
  } else {
    log(
      `Skipping verification since this is not running on ${CHAIN_ID.AURORA_MAINNET}`,
    )
  }
}
export default func
// func.skip = async (env) => true
