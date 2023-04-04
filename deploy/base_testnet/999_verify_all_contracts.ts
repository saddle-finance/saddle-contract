import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, network } = hre
  const { log } = deployments
  const network_deployments = await deployments.all()

  // for (const deployment in network_deployments) {
  if (
    (await getChainId()) === CHAIN_ID.BASE_TESTNET &&
    network.name !== "hardhat"
  ) {
    try {
      await hre.run("etherscan-verify", {
        network: "base_testnet",
        apiKey: process.env.ETHERSCAN_API,
      })
    } catch (e) {
      log(e)
    }
  } else {
    log(
      `Skipping verification since this is not running on ${CHAIN_ID.BASE_TESTNET}`,
    )
  }
}
// }
export default func
// func.skip = async (env) => true
