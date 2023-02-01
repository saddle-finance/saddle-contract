import { utils } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { asyncForEach } from "../../test/testUtils"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { execute, get, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const poolConfigs = [
    {
      swapAddress: (await get("SaddleBTCPool")).address,
      synthIndex: 3,
      currencyKey: utils.formatBytes32String("sBTC"),
    },
    {
      swapAddress: (await get("SaddleALETHPool")).address,
      synthIndex: 2,
      currencyKey: utils.formatBytes32String("sETH"),
    },
    {
      swapAddress: (await get("SaddleSUSDMetaPoolDeposit")).address,
      synthIndex: 0,
      currencyKey: utils.formatBytes32String("sUSD"),
    },
  ]

  if ((await getChainId()) == CHAIN_ID.MAINNET) {
    await asyncForEach(poolConfigs, async (config) => {
      try {
        await read("Bridge", "getSynthIndex", config.swapAddress)
      } catch {
        await execute(
          "Bridge",
          { from: deployer, log: true },
          "setSynthIndex",
          config.swapAddress,
          config.synthIndex,
          config.currencyKey,
        )
      }
    })
  } else {
    log(`deployment is not on mainnet. skipping ${path.basename(__filename)}`)
  }
}
export default func
func.tags = ["Bridge"]
func.dependencies = ["SynthSwapper"]
