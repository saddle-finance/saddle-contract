import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { PoolRegistry, IPoolRegistry } from "../../build/typechain"
import { PoolType } from "../../utils/constants"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  const pools: IPoolRegistry.PoolInputDataStruct[] = [
    {
      // sUSD meta pool v3
      poolAddress: (await get("SaddleSUSDMetaPoolV3")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("sUSD-USDv2_v3"),
      targetAddress: (await get("MetaSwapV3")).address,
      metaSwapDepositAddress: (await get("SaddleSUSDMetaPoolV3Deposit"))
        .address,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // tBTCv2 meta pool v3
      poolAddress: (await get("SaddleTBTCMetaPoolV3")).address,
      typeOfAsset: PoolType.BTC,
      poolName: ethers.utils.formatBytes32String("tBTCv2-BTCv2_v3"),
      targetAddress: (await get("MetaSwapV3")).address,
      metaSwapDepositAddress: (await get("SaddleTBTCMetaPoolV3Deposit"))
        .address,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // WCUSD meta pool v3
      poolAddress: (await get("SaddleWCUSDMetaPoolV3")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("WCUSD-USDv2_v3"),
      targetAddress: (await get("MetaSwapV3")).address,
      metaSwapDepositAddress: (await get("SaddleWCUSDMetaPoolV3Deposit"))
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
