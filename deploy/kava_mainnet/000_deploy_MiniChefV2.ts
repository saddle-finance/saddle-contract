import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MiniChefV2 } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get, execute, getOrNull, log } = deployments
  const { deployer } = await getNamedAccounts()

  const miniChef = await getOrNull("MiniChefV2")
  if (miniChef) {
    log(`Reusing MiniChefV2 at ${miniChef.address}`)
  } else {
    // TODO: get SDL deployment on this network
    await deploy("MiniChefV2", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [(await get("SDL")).address],
    })

    const minichef: MiniChefV2 = await ethers.getContract("MiniChefV2")

    const batchCall = [
      await minichef.populateTransaction.add(
        1,
        "0x0000000000000000000000000000000000000000", // blank lp token to enforce totalAllocPoint != 0
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        "0x619535e015f0e46c5984a0B45FD71C0549F001Fc", // 3pool lpToken
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        "0xcCf860874cbF2d615192a4C4455580B4d622D3B9", // USDTpool lpToken
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
  }
}
export default func
func.tags = ["MiniChef"]
