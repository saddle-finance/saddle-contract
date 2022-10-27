import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { IPoolRegistry, PoolRegistry } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")
  const vesperPoolAddress = (await get("SaddleFRAXBPVesperFRAXMetaPool"))
    .address
  const poolData = await poolRegistry.getPoolData(vesperPoolAddress)

  const newPoolData: IPoolRegistry.PoolDataStruct = {
    poolAddress: poolData.poolAddress,
    lpToken: poolData.lpToken,
    typeOfAsset: poolData.typeOfAsset,
    poolName: poolData.poolName,
    targetAddress: poolData.targetAddress,
    tokens: poolData.tokens,
    underlyingTokens: [
      (await get("vesperFRAXFRAXBP")).address,
      (await get("USDC")).address,
      (await get("FRAX")).address,
    ],
    basePoolAddress: poolData.basePoolAddress,
    metaSwapDepositAddress: (await get("SaddleFRAXBPVesperFRAXMetaPoolDeposit"))
      .address,
    isSaddleApproved: poolData.isSaddleApproved,
    isRemoved: poolData.isRemoved,
    isGuarded: poolData.isGuarded,
  }

  const pools: IPoolRegistry.PoolDataStruct[] = [newPoolData]

  const batchCall = await Promise.all(
    pools.map(
      async (pool) => await poolRegistry.populateTransaction.updatePool(pool),
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
  console.log(await poolRegistry.getPoolData(vesperPoolAddress))
}
export default func
func.skip = async () => true
