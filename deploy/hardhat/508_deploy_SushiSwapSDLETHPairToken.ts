import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { BIG_NUMBER_1E18 } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("SushiSwapPairSDLWETH", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: ["SushiSwap LP Token", "SLP", 18],
    contract: "GenericERC20NoOwnerFunction",
  })

  await execute(
    "SushiSwapPairSDLWETH",
    {
      from: deployer,
      log: true,
    },
    "mint",
    deployer,
    BIG_NUMBER_1E18.mul(1000),
  )
}
export default func
func.tags = ["veSDL"]
