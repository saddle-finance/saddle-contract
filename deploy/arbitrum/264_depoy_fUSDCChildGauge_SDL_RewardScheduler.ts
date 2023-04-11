import { ethers, getChainId } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ChildGauge, RewardScheduler } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"
import { OPS_MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  // Add SDL as reward token if it is not already
  const ChildGauge_CommunityfUSDCPoolLPToken: ChildGauge =
    await ethers.getContract("ChildGauge_CommunityfUSDCPoolLPToken")
  if (
    (
      await ChildGauge_CommunityfUSDCPoolLPToken.reward_data(
        (
          await get("SDL")
        ).address,
      )
    ).distributor == ZERO_ADDRESS
  ) {
    await execute(
      "ChildGauge_CommunityfUSDCPoolLPToken",
      { from: deployer, log: true },
      "add_reward",
      (
        await get("SDL")
      ).address,
      (
        await get("RewardForwarder_fUSDC_ChildGauge_CommunityfUSDCPoolLPToken")
      ).address,
    )
  }

  const RewardScheduler = await deploy(
    "RewardScheduler_ChildGauge_CommunityfUSDCLPToken_SDL",
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
        (await get("SDL")).address,
      ],
    },
  )

  // Transfer ownership to the ops multisig
  const RewardScheduler_ChildGauge_CommunityfUSDCLPToken: RewardScheduler =
    await ethers.getContract(
      "RewardScheduler_ChildGauge_CommunityfUSDCLPToken_SDL",
    )
  if (
    (await RewardScheduler_ChildGauge_CommunityfUSDCLPToken.owner()) !=
    OPS_MULTISIG_ADDRESSES[await getChainId()]
  ) {
    const rewardSchedulerOwnershipTX = await execute(
      "RewardScheduler_ChildGauge_CommunityfUSDCLPToken_SDL",
      { from: deployer, log: true },
      "transferOwnership",
      OPS_MULTISIG_ADDRESSES[await getChainId()],
    )
  }
}
export default func
