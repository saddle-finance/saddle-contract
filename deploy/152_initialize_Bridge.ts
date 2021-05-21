import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { CHAIN_ID } from "../utils/network"
import path from "path"
import { utils } from "ethers"
import { asyncForEach } from "../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, get, read, log } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  const poolConfigs = [
    {
      swapAddress: (await get("SaddleBTCPool")).address,
      synthIndex: 3,
      currencyKey: utils.formatBytes32String("sBTC"),
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
          { from: libraryDeployer, log: true },
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
