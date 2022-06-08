import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  // check VotingEscrow admin
  if ((await read("VotingEscrow", "admin")) === deployer) {
    await execute(
      "VotingEscrow",
      { from: deployer, log: true },
      "commit_transfer_ownership",
      MULTISIG_ADDRESSES[await getChainId()], // ownership admin
    )

    await execute(
      "VotingEscrow",
      { from: deployer, log: true },
      "apply_transfer_ownership",
    )
  }

  // check GaugeController admin
  if ((await read("GaugeController", "admin")) === deployer) {
    await execute(
      "GaugeController",
      { from: deployer, log: true },
      "commit_transfer_ownership",
      MULTISIG_ADDRESSES[await getChainId()], // ownership admin
    )

    await execute(
      "GaugeController",
      { from: deployer, log: true },
      "apply_transfer_ownership",
    )
  }
}
export default func
