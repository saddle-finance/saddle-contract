import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { PoolRegistry } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"
import { PoolType } from "../../utils/constants"
import { IPoolRegistry } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  const pools: IPoolRegistry.PoolInputDataStruct[] = [
    {
      // frax USDC Base Pool
      poolAddress: (await get("SaddleFRAXBPPool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("FRAX-USDC-BP"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // frax USDs meta Pool
      poolAddress: (await get("SaddleFRAXUSDsMetaPool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("FRAXBP-SUSD"),
      targetAddress: (await get("SaddleFRAXUSDsMetaPool")).address,
      metaSwapDepositAddress: (await get("SaddleFRAXUSDsMetaPoolDeposit"))
        .address,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // frax USDT meta Pool
      poolAddress: (await get("SaddleFRAXUSDTMetaPool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("FRAXBP-USDT"),
      targetAddress: (await get("SaddleFRAXUSDTMetaPool")).address,
      metaSwapDepositAddress: (await get("SaddleFRAXUSDTMetaPoolDeposit"))
        .address,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
  ]

  await poolRegistry
    .getPoolDataByName(pools[0].poolName)
    .then(() => {
      log("Skipping adding pools to registry because they are already added")
    })
    .catch(async () => {
      log("Adding pools to registry")

      const batchCall = await Promise.all(
        pools.map(
          async (pool) => await poolRegistry.populateTransaction.addPool(pool),
        ),
      )

      const batchCallData = batchCall
        .map((x) => x.data)
        .filter((x): x is string => !!x)

      await execute(
        "PoolRegistry",
        { from: deployer, log: true },
        "batch",
        batchCallData,
        true,
      )
    })
}
export default func
