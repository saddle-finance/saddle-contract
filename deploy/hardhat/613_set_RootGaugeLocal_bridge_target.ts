import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { isHardhatNetwork } from "../../utils/network"

// NOTE: this script is *not* meant to be run on any network except hardhat

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  if (isHardhatNetwork(await getChainId())) {
    const CHILD_CHAIN_STREAMER_CONTRACT_NAME = "ChildChainStreamer"

    const childChainStreamer = (await get(CHILD_CHAIN_STREAMER_CONTRACT_NAME))
      .address

    // Set bridge target for RootGaugeLocal.
    // Note, that this is only necessary for local hardhat testing
    // In prod, the bridge targets are given by bridge contracts
    await execute(
      "RootGaugeLocal",
      { from: deployer, log: true },
      "set_child_chain_streamer(address)",
      childChainStreamer,
    )
  }
}

export default func
func.tags = ["RootGaugeLocal"]
