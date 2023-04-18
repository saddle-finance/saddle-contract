import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ChildGauge } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const ChildGaugeName = "ChildGauge_CommunityfUSDCPoolLPTokenV2"

  await deploy(`RewardForwarder_fUSDC_${ChildGaugeName}`, {
    from: deployer,
    contract: "RewardForwarder",
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await get(ChildGaugeName)).address],
  })

  // Add fUSDC as reward token if it is not already
  const ChildGauge_CommunityfUSDCPoolLPToken: ChildGauge =
    await ethers.getContract(ChildGaugeName)
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
      ChildGaugeName,
      { from: deployer, log: true },
      "add_reward",
      (
        await get("fUSDC")
      ).address,
      (
        await get(`RewardForwarder_fUSDC_${ChildGaugeName}`)
      ).address,
    )
  }
}
export default func
// func.skip = async () => true
