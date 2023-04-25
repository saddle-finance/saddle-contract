import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { ChildGauge } from "../../build/typechain"
import {
  getCurrentBlockTimestamp,
  impersonateAccount,
  setEtherBalance,
} from "../../test/testUtils"
import { WEEK } from "../../utils/time"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()

  // In prod, update these values
  const owner = deployer
  const crossChainDeployer = libraryDeployer

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
    skipIfAlreadyDeployed: true,
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

  // Impersonate bridge account
  const bridgeOwner = await impersonateAccount(
    "0x4200000000000000000000000000000000000010",
  )

  // Set ether balance of bridge account to non-zero for sending txs
  await setEtherBalance(
    await bridgeOwner.getAddress(),
    ethers.utils.parseEther("1000"),
  )

  // Mint 10000 SDL to the deployed child gauge
  const childGauge: ChildGauge = await ethers.getContract(
    "ChildGauge_SaddleFRAXBPPoolLPToken",
  )
  const cgf = await ethers.getContract("ChildGaugeFactory")
  const sdl = await ethers.getContract("SDL")
  await sdl.connect(bridgeOwner).mint(
    childGauge.address,
    ethers.utils.parseEther("100000"), // 100,000 SDL
  )

  // Checkpoint with deployer account. This will make make the child gauge understand that
  // it has 100,000 SDL. Then it will send 100,000 SDL to the CGF contract for distribution
  // for people who stake in this week epoch.
  await execute(
    "ChildGauge_SaddleFRAXBPPoolLPToken",
    executeOptions,
    "user_checkpoint",
    deployer,
  )

  // Expect SDL has been sent from the child gauge to the CGF contract
  expect(await sdl.balanceOf(childGauge.address)).to.eq(0)
  expect(await sdl.balanceOf(cgf.address)).to.eq(
    ethers.utils.parseEther("100000"),
  )

  // Expect this week's rate to be not equal to 0
  const currentInflationRate = await childGauge.inflation_rate(
    Math.floor((await getCurrentBlockTimestamp()) / WEEK),
  )
  expect(currentInflationRate).to.gt(0)
  log(
    `ChildGauge_SaddleFRAXBPPoolLPToken's weekly SDL emission rate set to ${currentInflationRate}`,
  )
}
export default func
func.skip = async () => true
