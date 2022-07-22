import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("Minter", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("SDL")).address,
      (await get("GaugeController")).address,
      MULTISIG_ADDRESSES[await getChainId()], // emergency admin who recieves the clawback funds
      MULTISIG_ADDRESSES[await getChainId()], // admin to control the reward rate.
    ],
  })
}
export default func
func.tags = ["veSDL"]
