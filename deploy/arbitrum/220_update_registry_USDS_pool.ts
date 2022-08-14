import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { PoolRegistry } from "../../build/typechain"
import { PoolType } from "../../utils/constants"
import { IPoolRegistry } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  const pools: IPoolRegistry.PoolDataStruct[] = [
    {
      // FraxBP - USDs
      poolAddress: (await get("SaddleFRAXUSDsMetaPool")).address,
      lpToken: (await get("SaddleFRAXUSDsMetaPoolLPToken")).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String("FRAXBP-USDs"),
      targetAddress: (await get("SaddleFRAXUSDsMetaPool")).address,
      tokens: [
        (await get("USDs")).address,
        (await get("SaddleFRAXBPPoolLPToken")).address,
      ],
      underlyingTokens: [
        (await get("USDs")).address,
        (await get("FRAX")).address,
        (await get("USDC")).address,
      ],
      basePoolAddress: (await get("SaddleFRAXBPPool")).address,
      metaSwapDepositAddress: (await get("SaddleFRAXUSDsMetaPoolDeposit"))
        .address,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    },
  ]

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
}
export default func
