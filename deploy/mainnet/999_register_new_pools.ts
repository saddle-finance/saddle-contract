import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { PoolRegistry } from "../../build/typechain"
import { PoolType } from "../../utils/constants"
import { IPoolRegistry } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  const pools: IPoolRegistry.PoolInputDataStruct[] = [
    // {
    //   // sUSD meta pool v3
    //   poolAddress: (await get("SaddleSUSDMetaPoolV3")).address,
    //   typeOfAsset: PoolType.USD,
    //   poolName: ethers.utils.formatBytes32String("sUSD-USDv2_v3"),
    //   targetAddress: (await get("MetaSwapV3")).address,
    //   metaSwapDepositAddress: (await get("SaddleSUSDMetaPoolV3Deposit"))
    //     .address,
    //   isSaddleApproved: true,
    //   isRemoved: false,
    //   isGuarded: false,
    // },
    // {
    //   // tBTCv2 meta pool v3
    //   poolAddress: (await get("SaddleTBTCMetaPoolV3")).address,
    //   typeOfAsset: PoolType.BTC,
    //   poolName: ethers.utils.formatBytes32String("tBTCv2-BTCv2_v3"),
    //   targetAddress: (await get("MetaSwapV3")).address,
    //   metaSwapDepositAddress: (await get("SaddleTBTCMetaPoolV3Deposit"))
    //     .address,
    //   isSaddleApproved: true,
    //   isRemoved: false,
    //   isGuarded: false,
    // },
    // {
    //   // WCUSD meta pool v3
    //   poolAddress: (await get("SaddleWCUSDMetaPoolV3")).address,
    //   typeOfAsset: PoolType.USD,
    //   poolName: ethers.utils.formatBytes32String("WCUSD-USDv2_v3"),
    //   targetAddress: (await get("MetaSwapV3")).address,
    //   metaSwapDepositAddress: (await get("SaddleWCUSDMetaPoolV3Deposit"))
    //     .address,
    //   isSaddleApproved: true,
    //   isRemoved: false,
    //   isGuarded: false,
    // },
    {
      // frax USDC Base Pool
      poolAddress: (await get("SaddleFraxBPPool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("FRAX-USDC-BP"),
      targetAddress: (await get("Swap")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // frax SUSD meta Pool
      poolAddress: (await get("SaddleFRAXsUSDMetaPool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("FRAXBP-SUSD"),
      targetAddress: (await get("MetaSwapV3")).address,
      metaSwapDepositAddress: (await get("SaddleFRAXsUSDMetaPoolDeposit"))
      .address,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // frax alUSD meta Pool
      poolAddress: (await get("SaddleFRAXalUSDMetaPool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("FRAXBP-alUSD"),
      targetAddress: (await get("MetaSwapV3")).address,
      metaSwapDepositAddress: (await get("SaddleFRAXalUSDMetaPoolDeposit"))
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
      targetAddress: (await get("MetaSwapV3")).address,
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
      const batchCallData = batchCall.map((x) => x.data).filter(Boolean)

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
