import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, network } = hre
  const { log } = deployments

  if (
    (await getChainId()) === CHAIN_ID.OPTIMISM_MAINNET &&
    network.name !== "hardhat"
  ) {
    await hre.run("etherscan-verify")
  } else {
    log(
      `Skipping verification since this is not running on ${CHAIN_ID.OPTIMISM_MAINNET}`,
    )
  }
}
export default func
