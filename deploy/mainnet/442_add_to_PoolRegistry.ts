import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { PoolRegistry } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"
import { PoolType } from "../../utils/constants"
import { IPoolRegistry } from "../../build/typechain/"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  await poolRegistry
    .getPoolDataByName(ethers.utils.formatBytes32String("USDv2"))
    .then(() => {
      log("Skipping adding pools to registry because they are already added")
    })
    .catch(async () => {
      log("Adding pools to registry")
      const pools: IPoolRegistry.PoolInputDataStruct[] = [
        {
          // USDv2 pool
          poolAddress: (await get("SaddleUSDPoolV2")).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String("USDv2"),
          targetAddress: (await get("SwapFlashLoan")).address,
          metaSwapDepositAddress: ZERO_ADDRESS,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // D4 pool
          poolAddress: (await get("SaddleD4Pool")).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String("D4"),
          targetAddress: (await get("SwapFlashLoan")).address,
          metaSwapDepositAddress: ZERO_ADDRESS,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // BTCv2 pool
          poolAddress: (await get("SaddleBTCPoolV2")).address,
          typeOfAsset: PoolType.BTC,
          poolName: ethers.utils.formatBytes32String("BTCv2"),
          targetAddress: (await get("SwapFlashLoan")).address,
          metaSwapDepositAddress: ZERO_ADDRESS,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // alETH pool
          poolAddress: (await get("SaddleALETHPool")).address,
          typeOfAsset: PoolType.ETH,
          poolName: ethers.utils.formatBytes32String("alETH"),
          targetAddress: (await get("SwapFlashLoan")).address,
          metaSwapDepositAddress: ZERO_ADDRESS,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // tBTCv2 meta pool updated
          poolAddress: (await get("SaddleTBTCMetaPoolUpdated")).address,
          typeOfAsset: PoolType.BTC,
          poolName: ethers.utils.formatBytes32String("tBTCv2-BTCv2"),
          targetAddress: (await get("MetaSwapUpdated")).address,
          metaSwapDepositAddress: (
            await get("SaddleTBTCMetaPoolUpdatedDeposit")
          ).address,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // sUSD meta pool updated
          poolAddress: (await get("SaddleSUSDMetaPoolUpdated")).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String("sUSD-USDv2"),
          targetAddress: (await get("MetaSwapUpdated")).address,
          metaSwapDepositAddress: (
            await get("SaddleSUSDMetaPoolUpdatedDeposit")
          ).address,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // WCUSD meta pool updated
          poolAddress: (await get("SaddleWCUSDMetaPoolUpdated")).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String("WCUSD-USDv2"),
          targetAddress: (await get("MetaSwapUpdated")).address,
          metaSwapDepositAddress: (
            await get("SaddleWCUSDMetaPoolUpdatedDeposit")
          ).address,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // vETH2 pool
          poolAddress: (await get("SaddleVETH2Pool")).address,
          typeOfAsset: PoolType.ETH,
          poolName: ethers.utils.formatBytes32String("vETH2"),
          targetAddress: "0x5847f8177221268d279Cf377D0E01aB3FD993628",
          metaSwapDepositAddress: ZERO_ADDRESS,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        },
        {
          // BTC pool
          poolAddress: (await get("SaddleBTCPool")).address,
          typeOfAsset: PoolType.BTC,
          poolName: ethers.utils.formatBytes32String("BTC"),
          targetAddress: (await get("SaddleBTCPool")).address,
          metaSwapDepositAddress: ZERO_ADDRESS,
          isSaddleApproved: true,
          isRemoved: true,
          isGuarded: true,
        },
        {
          // USD pool
          poolAddress: (await get("SaddleUSDPool")).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String("USD"),
          targetAddress: "0x98D2aFc66DE1F73598c6CFa35cbdfebB135fb8FA",
          metaSwapDepositAddress: ZERO_ADDRESS,
          isSaddleApproved: true,
          isRemoved: true,
          isGuarded: false,
        },
        {
          // sUSD meta pool updated
          poolAddress: (await get("SaddleSUSDMetaPool")).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String("sUSD-USDv2_outdated"),
          targetAddress: (await get("SaddleSUSDMetaPool")).address,
          metaSwapDepositAddress: (await get("SaddleSUSDMetaPoolDeposit"))
            .address,
          isSaddleApproved: true,
          isRemoved: true,
          isGuarded: false,
        },
        {
          // tBTCv2 meta pool updated
          poolAddress: (await get("SaddleTBTCMetaPool")).address,
          typeOfAsset: PoolType.BTC,
          poolName: ethers.utils.formatBytes32String("tBTCv2-BTCv2_outdated"),
          targetAddress: (await get("SaddleSUSDMetaPool")).address,
          metaSwapDepositAddress: (await get("SaddleTBTCMetaPoolDeposit"))
            .address,
          isSaddleApproved: true,
          isRemoved: true,
          isGuarded: false,
        },
        {
          // WCUSD meta pool updated
          poolAddress: (await get("SaddleWCUSDMetaPool")).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String("WCUSD-USDv2_outdated"),
          targetAddress: (await get("SaddleWCUSDMetaPool")).address,
          metaSwapDepositAddress: (await get("SaddleWCUSDMetaPoolDeposit"))
            .address,
          isSaddleApproved: true,
          isRemoved: true,
          isGuarded: false,
        },
      ]

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
