import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const RewardScheduler = await deploy(
    "RewardScheduler_ChildGauge_CommunityfUSDCLPToken",
    {
      from: deployer,
      contract: "RewardScheduler",
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
        (
          await get(
            "RewardForwarder_fUSDC_ChildGauge_CommunityfUSDCPoolLPToken",
          )
        ).address,
        (await get("fUSDC")).address,
      ],
    },
  )

  // Transfer ownership to fUSDC_Reward_Manager_Address
  // Commenting out for forked deployments
  // const rewardSchedulerOwnershipTX = await execute(
  //   "RewardScheduler_ChildGauge_CommunityfUSDCLPToken",
  //   { from: deployer, log: true },
  //   "transferOwnership",
  //   fUSDC_Reward_Manager_Address,
  // )
}
export default func
