import { expect } from "chai"
import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ZERO_ADDRESS } from "../../test/testUtils"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, execute, get, getOrNull, save, read } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  if ((await getOrNull("SimpleRewarder")) == null) {
    const result = await deploy("SimpleRewarder", {
      from: deployer,
      log: true,
      args: [(await get("MiniChefV2")).address],
      skipIfAlreadyDeployed: true,
    })

    await save("SimpleRewarder_KEEP", result)

    const PID = 5
    const tbtcMetaPoolLpToken = (await get("SaddleTBTCMetaPoolUpdatedLPToken"))
      .address
    const rewardToken = (await get("KEEP")).address // KEEP token
    const rewardAdmin = "0xb78c0cf4c9e9bf4ba24b17065fa8c0ac71957653" // KEEP team's OpEx wallet
    const rewardPerSecond = BigNumber.from("413359788359788360") // 250k KEEP weekly

    // Ensure LP token is added to MiniChefV2, uses arbitrary allocpoint
    if ((await getChainId()) == CHAIN_ID.HARDHAT)
      await execute(
        "MiniChefV2",
        { from: deployer, log: true },
        "add",
        1,
        tbtcMetaPoolLpToken,
        ZERO_ADDRESS,
      )

    // Ensure pid is correct
    expect(await read("MiniChefV2", "lpToken", PID)).to.eq(tbtcMetaPoolLpToken)

    // (IERC20 rewardToken, address owner, uint256 rewardPerSecond, IERC20 masterLpToken, uint256 pid)
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256", "address", "uint256"],
      [
        rewardToken, // KEEP token
        rewardAdmin, // KEEP team's OpEx wallet
        rewardPerSecond, // 250k KEEP weekly
        tbtcMetaPoolLpToken, // master LP token
        PID, // pid
      ],
    )

    await execute(
      "SimpleRewarder_KEEP",
      { from: deployer, log: true },
      "init",
      data,
    )
  }
}
export default func
func.tags = ["SimpleRewarder_KEEP"]
