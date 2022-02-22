import { expect } from "chai"
import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, execute, get, getOrNull, save, read } = deployments
  const { deployer } = await getNamedAccounts()

  if ((await getOrNull("SimpleRewarder")) == null) {
    const result = await deploy("SimpleRewarder", {
      from: deployer,
      log: true,
      args: [(await get("MiniChefV2")).address],
      skipIfAlreadyDeployed: true,
    })

    await save("SimpleRewarder_SPA", result)

    const PID = 2
    const lpToken = (await get("SaddleArbUSDSMetaPoolLPToken")).address
    const rewardToken = "0x5575552988A3A80504bBaeB1311674fCFd40aD4B" // SPA token
    const rewardAdmin = "0x80a31ee7c8F9a24D7EBBE3fAFbaaF6f422307F06" // SPA team's multisig wallet
    const rewardPerSecond = BigNumber.from("1286008200000000000") // SPA reward per second

    // Ensure pid is correct
    expect(await read("MiniChefV2", "lpToken", PID)).to.eq(lpToken)

    // (IERC20 rewardToken, address owner, uint256 rewardPerSecond, IERC20 masterLpToken, uint256 pid)
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256", "address", "uint256"],
      [
        rewardToken, // SPA token
        rewardAdmin, // SPA team's OpEx wallet
        rewardPerSecond, // 250k SPA weekly
        lpToken, // master LP token
        PID, // pid
      ],
    )

    await execute(
      "SimpleRewarder_SPA",
      { from: deployer, log: true },
      "init",
      data,
    )
  }
}
export default func
func.tags = ["SimpleRewarder"]
