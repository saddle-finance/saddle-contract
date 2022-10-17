import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, ethers } = hre
  const { log } = deployments

  if ((await getChainId()) === CHAIN_ID.KAVA_MAINNET) {
    try {
      await hre.run("etherscan-verify")
    } catch (error) {
      console.log("verification failed with: ", error)
    }
  } else {
    log(
      `Skipping verification since this is not running on ${CHAIN_ID.KAVA_MAINNET}`,
    )
  }
}
export default func
