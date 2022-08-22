import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MiniChefV2 } from "../../build/typechain"
import { ethers } from "hardhat"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get, execute, getOrNull, log } = deployments
  const { deployer } = await getNamedAccounts()

  const miniChef = await getOrNull("MiniChefV2")
  if (miniChef) {
    log(`Reusing MiniChefV2 at ${miniChef.address}`)
  } else {
    // Deploy retroactive vesting contract for airdrops
    await deploy("MiniChefV2", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [(await get("SDL")).address],
    })

    const minichef: MiniChefV2 = await ethers.getContract("MiniChefV2")

    const batchCall = [
      await minichef.populateTransaction.setSaddlePerSecond(0),
      await minichef.populateTransaction.add(
        0,
        "0x0000000000000000000000000000000000000000", // blank lp token to enforce totalAllocPoint != 0
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        3497,
        (
          await get("SaddleFRAXBPPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        500,
        (
          await get("SaddleOptFRAXMetaPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        500,
        (
          await get("SaddleFRAXUSDTMetaPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        500,
        (
          await get("SaddleFRAXsUSDMetaPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        1,
        (
          await get("SaddleOptUSDPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
    ]

    const batchCallData = batchCall.map((x) => x.data)

    // Send batch call
    await execute(
      "MiniChefV2",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      false,
    )

    // Keeping ownership of the conntract until emission amount is set
    // After adding new PIDs, transfer ownership to multisig.
  }
}
export default func
func.tags = ["MiniChef"]
