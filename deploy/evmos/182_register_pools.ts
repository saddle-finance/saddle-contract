import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { IPoolRegistry, PoolRegistry } from "../../build/typechain"
import { ZERO_ADDRESS } from "../../test/testUtils"
import { PoolType } from "../../utils/constants"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  const pools: IPoolRegistry.PoolInputDataStruct[] = [
    {
      // Evmos ceUSDT pool
      poolAddress: (await get("SaddleCelarUSDTPool")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("ceUSDC-ceUSDT"),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
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

  const poolsToBeRegistered: IPoolRegistry.PoolInputDataStruct[] = []
  for (let pid = 0; pid < pools.length; pid++) {
    await poolRegistry
      .getPoolDataByName(pools[pid].poolName)
      .then(() => {
        log(
          `Skipping adding ${pools[pid].poolAddress} to registry because they are already added`,
        )
      })
      .catch(async () => {
        "adding pool to registry"
        poolsToBeRegistered.push(pools[pid])
      })
  }

  if (poolsToBeRegistered.length > 0) {
    const batchCall = await Promise.all(
      poolsToBeRegistered.map(
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
      false,
    )
  } else {
    log("No pools to be registered")
  }
}
export default func
func.skip = async () => true
