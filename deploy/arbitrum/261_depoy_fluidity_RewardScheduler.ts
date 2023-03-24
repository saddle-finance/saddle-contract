import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { fUSDC_Reward_Manager_Address } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const RewardScheduler = await deploy(
    "RewardScheduler_ChildGauge_CommunityfUSDCLPToken",
    {
      from: deployer,
      contract: "RewardScheduler",
      log: true,
      skipIfAlreadyDeployed: true,
      args: [fUSDC_Reward_Manager_Address, (await get("fUSDC")).address],
    },
  )

  // Transfer ownership to fUSDC_Reward_Manager_Address
  const rewardScheduler = await ethers.getContractAt(
    "RewardScheduler",
    RewardScheduler.address,
  )
  await rewardScheduler.transferOwnership(fUSDC_Reward_Manager_Address)
}
export default func
