import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ChildGauge } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("RewardForwarder_fUSDC_ChildGauge_CommunityfUSDCPoolLPToken", {
    from: deployer,
    contract: "RewardForwarder",
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await get("ChildGauge_CommunityfUSDCPoolLPToken")).address],
  })

  // Add fUSDC as reward token if it is not already
  const ChildGauge_CommunityfUSDCPoolLPToken: ChildGauge =
    await ethers.getContract("ChildGauge_CommunityfUSDCPoolLPToken")
  if (
    (
      await ChildGauge_CommunityfUSDCPoolLPToken.reward_data(
        (
          await get("fUSDC")
        ).address,
      )
    ).distributor == ZERO_ADDRESS
  ) {
    await execute(
      "ChildGauge_CommunityfUSDCPoolLPToken",
      { from: deployer, log: true },
      "add_reward",
      (
        await get("fUSDC")
      ).address,
      (
        await get("RewardForwarder_fUSDC_ChildGauge_CommunityfUSDCPoolLPToken")
      ).address,
    )
  }
}
export default func
