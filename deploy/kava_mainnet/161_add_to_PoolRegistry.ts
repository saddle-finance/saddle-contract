import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { PoolRegistry } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"
import { IPoolRegistry } from "../../build/typechain/"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  const pools: IPoolRegistry.PoolInputDataStruct[] = [
    {
      // SaddleUSDTPool
      poolAddress: (await get("SaddleUSDTPool")).address,
      typeOfAsset: 2,
      poolName: ethers.utils.formatBytes32String("USDC-USDT"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
    // {
    //   // Saddle3Pool
    //   poolAddress: (await get("Saddle3Pool")).address,
    //   typeOfAsset: PoolType.USD,
    //   poolName: ethers.utils.formatBytes32String("USDC-USDT-DAI"),
    //   targetAddress: (await get("SwapFlashLoan")).address,
    //   metaSwapDepositAddress: ZERO_ADDRESS,
    //   isSaddleApproved: true,
    //   isRemoved: false,
    //   isGuarded: false,
    // },
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
