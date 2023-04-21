import { ethers, getChainId } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { RewardScheduler } from "../../build/typechain"
import { OPS_MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const RewardScheduler = await deploy(
    "RewardScheduler_ChildGauge_CommunityfUSDCLPToken_fUSDC",
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

  // Transfer ownership to the ops multisig
  const RewardScheduler_ChildGauge_CommunityfUSDCLPToken: RewardScheduler =
    await ethers.getContract(
      "RewardScheduler_ChildGauge_CommunityfUSDCLPToken_fUSDC",
    )
  if (
    (await RewardScheduler_ChildGauge_CommunityfUSDCLPToken.owner()) !=
    OPS_MULTISIG_ADDRESSES[await getChainId()]
  ) {
    const rewardSchedulerOwnershipTX = await execute(
      "RewardScheduler_ChildGauge_CommunityfUSDCLPToken_fUSDC",
      { from: deployer, log: true },
      "transferOwnership",
      OPS_MULTISIG_ADDRESSES[await getChainId()],
    )
  }
}
export default func
