import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, log, read } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const currentOwner = await read("SaddleBTCPool", "owner")
  const isBTCPoolGuarded = await read("SaddleBTCPool", "isGuarded")

  // Disable the guarded phase launch
  if (isBTCPoolGuarded) {
    if (currentOwner == deployer) {
      log(`disabling BTC pool guard from deployer ${deployer}`)
      await execute(
        "SaddleBTCPool",
        { from: deployer, log: true },
        "disableGuard",
      )
    } else {
      log(`cannot disable BTC pool guard. owner is set to ${currentOwner}`)
    }
  } else {
    log(`btc pool guard is already disabled`)
  }
}
export default func
func.dependencies = ["BTCPool"]
