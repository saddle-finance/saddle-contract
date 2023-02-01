import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { isMainnet } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { execute, log, read } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

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
          `transferring the ownership of "${contract}" to the multisig: ${MULTISIG_ADDRESSES[currentChain]}`,
        )
        await execute(
          contract,
          { from: deployer, log: true },
          "transferOwnership",
          MULTISIG_ADDRESSES[currentChain],
        )
      }
      // If Multisig already owns the contract, skip
      else if (currentOwner == MULTISIG_ADDRESSES[currentChain]) {
        log(
          `"${contract}" is already owned by the multisig: ${MULTISIG_ADDRESSES[currentChain]}`,
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
