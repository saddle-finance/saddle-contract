import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { PoolRegistry } from "../../build/typechain"
import { IPoolRegistry } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")
  const usdsPoolAddress = (await get("SaddleFRAXUSDsMetaPool")).address
  const poolData = await poolRegistry.getPoolData(usdsPoolAddress)

  // Use existing poolData but update underlyingTokens
  poolData.underlyingTokens = [
    (await get("USDs")).address,
    (await get("USDC")).address,
    (await get("FRAX")).address,
  ]

  const pools: IPoolRegistry.PoolDataStruct[] = [poolData]

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
func.skip = async () => true
