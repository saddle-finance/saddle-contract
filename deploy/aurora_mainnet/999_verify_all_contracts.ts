import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, network } = hre
  const { log } = deployments

  await hre.run("etherscan-verify --api-url https://api.aurorascan.dev/api")
  // if (
  //   (await getChainId()) === CHAIN_ID.AURORA_MAINNET &&
  //   network.name !== "hardhat"
  // ) {
  //   await hre.run("etherscan-verify")
  // } else {
  //   log(
  //     `Skipping verification since this is not running on ${CHAIN_ID.AURORA_MAINNET}`,
  //   )
  // }
}
export default func
