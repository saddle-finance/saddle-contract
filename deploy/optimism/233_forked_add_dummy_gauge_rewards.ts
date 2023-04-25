import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { ChildGauge, GenericERC20 } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()
  const signers = await ethers.getSigners()

  // In prod, update these values
  const owner = deployer
  const crossChainDeployer = libraryDeployer

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  // Skip this script if not running on forked mode
  if (process.env.HARDHAT_DEPLOY_FORK == null) {
    log(`Not running on forked mode, skipping ${path.basename(__filename)}`)
    return
  }

  await deploy("DummyRewardToken", {
    log: true,
    from: signers[0].address,
    contract: "GenericERC20",
    args: ["Dummy Reward Token", "DRT", 18],
  })

  const dummyRewardToken: GenericERC20 = await ethers.getContract(
    "DummyRewardToken",
  )
  await execute(
    "DummyRewardToken",
    {
      log: true,
      from: signers[0].address,
    },
    "mint",
    signers[0].address,
    ethers.utils.parseEther("1000000"),
  )

  const childGauge: ChildGauge = await ethers.getContract(
    "ChildGauge_SaddleFRAXBPPoolLPToken",
  )

  await execute(
    "ChildGauge_SaddleFRAXBPPoolLPToken",
    executeOptions,
    "add_reward",
    dummyRewardToken.address,
    signers[0].address,
  )

  await execute(
    "DummyRewardToken",
    {
      log: true,
      from: signers[0].address,
    },
    "approve",
    childGauge.address,
    ethers.constants.MaxUint256,
  )

  await execute(
    "ChildGauge_SaddleFRAXBPPoolLPToken",
    {
      log: true,
      from: signers[0].address,
    },
    "deposit_reward_token",
    dummyRewardToken.address,
    ethers.utils.parseEther("1000000"),
  )

  expect(
    (await childGauge.reward_data(dummyRewardToken.address))["rate"],
  ).to.be.gt(0)
}

export default func
func.skip = async () => true
