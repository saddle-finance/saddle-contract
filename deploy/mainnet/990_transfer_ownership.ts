import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESS } from "../utils/accounts"
import { isMainnet } from "../utils/network"
import path from "path"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, log, read } = deployments
  const { deployer } = await getNamedAccounts()

  const contractsToTransferOwnership = [
    "Allowlist",
    "SaddleBTCPool",
    "SaddleUSDPool",
    "SaddleVETH2Pool",
    "SaddleALETHPool",
    "SaddleD4Pool",
  ]

  const currentChain = await getChainId()
  if (isMainnet(currentChain)) {
    for (const contract of contractsToTransferOwnership) {
      // Check current owner
      const currentOwner = await read(contract, "owner")

      // If the deployer still owns the contract, then transfer the ownership to the multisig
      if (currentOwner == deployer) {
        log(
          `transferring the ownership of "${contract}" to the multisig: ${MULTISIG_ADDRESS}`,
        )
        await execute(
          contract,
          { from: deployer, log: true },
          "transferOwnership",
          MULTISIG_ADDRESS,
        )
      }
      // If Multisig already owns the contract, skip
      else if (currentOwner == MULTISIG_ADDRESS) {
        log(
          `"${contract}" is already owned by the multisig: ${MULTISIG_ADDRESS}`,
        )
      }
      // Someone else owns the contract
      else {
        log(`"${contract}" is owned by unrecognized address: ${currentOwner}`)
      }
    }
  } else {
    log(`deployment is not on mainnet. skipping ${path.basename(__filename)}`)
  }
}
export default func
func.tags = ["TransferOwnership"]
func.dependencies = ["Allowlist", "BTCPool", "USDPool"]
