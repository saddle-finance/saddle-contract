import { BIG_NUMBER_1E18, isTestNetwork } from "../../test/testUtils"

import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, get, execute, getOrNull } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  if ((await getOrNull("RetroactiveVesting")) == null) {
    // Deploy retroactive vesting contract for airdrops
    await deploy("RetroactiveVesting", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
        (await get("SDL")).address,
        isTestNetwork(await getChainId())
          ? "0xd6a1b52194896b83e8872ba351a81ad70f78258c4f9575c1f4c6d24090b05a5e"
          : "0x235d88efaae4e04494277ca85279b0550806a2b3efb124e38933a167ba4e7cec",
        1637042400, // Tuesday, November 16, 2021 6:00:00 AM
      ],
    })

    // Transfer 150_000_000 SDL tokens to the retroactive vesting contract
    await execute(
      "SDL",
      { from: deployer, log: true },
      "transfer",
      (
        await get("RetroactiveVesting")
      ).address,
      BIG_NUMBER_1E18.mul(150_000_000),
    )
  }
}
export default func
func.tags = ["RetroactiveVesting"]
