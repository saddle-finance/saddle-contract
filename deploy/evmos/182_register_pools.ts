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
      // Evmos 3 pool
      poolAddress: (await get("SaddleEvmos3pool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("DAI-USDC-USDT"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // Evmos BTC pool
      poolAddress: (await get("SaddleEvmosBTCPool")).address,
      typeOfAsset: PoolType.BTC,
      poolName: ethers.utils.formatBytes32String("wBTC-renBTC"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // tBTC meta pool
      poolAddress: (await get("SaddleTBTCMetaPool")).address,
      typeOfAsset: PoolType.BTC,
      poolName: ethers.utils.formatBytes32String("saddleEvmosWRenBTC-tBTC"),
      targetAddress: (await get("SaddleTBTCMetaPool")).address,
      metaSwapDepositAddress: (await get("SaddleTBTCMetaPoolDeposit")).address,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // Evmos 4 pool
      poolAddress: (await get("SaddleEvmos4Pool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("DAI-USDC-USDT-FRAX"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    {
      // Evmos FRAX 3 pool
      poolAddress: (await get("SaddleEvmosFrax3Pool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("USDT-USDC-FRAX"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
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
