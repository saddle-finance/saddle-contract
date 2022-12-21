import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  await deploy("DelegationProxy", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("VotingEscrowDelegation")).address,
      (await get("VotingEscrow")).address,
      MULTISIG_ADDRESSES[await getChainId()], // ownership admin
      deployer, // emergency admin
    ],
  })
}
export default func
func.tags = ["veSDL"]
