import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  await deploy("VeSDLRewards", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("VotingEscrow")).address,
      (await get("SDL")).address,
      MULTISIG_ADDRESSES[await getChainId()], // admin
    ],
  })

  // Set veSDL.reward_pool to the deployed VeSDLRewards contract
  const currentRewardPool = await read("VotingEscrow", "reward_pool")
  if (currentRewardPool === ethers.constants.AddressZero) {
    await execute(
      "VotingEscrow",
      { from: deployer, log: true },
      "set_reward_pool",
      (
        await get("VeSDLRewards")
      ).address, // ownership admin
    )
  }
}
export default func
func.tags = ["veSDL"]
