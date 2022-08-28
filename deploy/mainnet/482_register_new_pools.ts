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

  const pools: IPoolRegistry.PoolInputDataStructOutput[] = [
    {
      // 4 pool will not be used on the frontend
      poolAddress: (await get("Saddle4Pool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("4pool"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: true, // Mark as removed since this pool will not be featued
      isGuarded: false,
    },
    {
      // frax 3 pool that will featured on the frontend
      poolAddress: (await get("SaddleFrax3Pool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("frax3pool"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
  ] as IPoolRegistry.PoolInputDataStructOutput[]

  await poolRegistry
    .getPoolDataByName(pools[0].poolName)
    .then(() => {
      log("Skipping adding pools to registry because they are already added")
    })
    .catch(async () => {
      log(
        `Adding pools: [${pools.map((pool) =>
          ethers.utils.parseBytes32String(pool.poolName),
        )}] to registry`,
      )

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
