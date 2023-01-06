import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

// Deployment names
const META_POOL_NAME = "SaddleTBTCMetaPoolV3"
const META_POOL_LP_TOKEN_NAME = `${META_POOL_NAME}LPToken`
const BASE_POOL_NAME = "SaddleBTCPoolV2"

// Constructor arguments
const TOKEN_NAMES = ["TBTCv2", `${BASE_POOL_NAME}LPToken`]
const TOKEN_DECIMALS = [18, 18]
const LP_TOKEN_NAME = "Saddle tBTCv2/saddleWRenSBTC V3 LP Token"
const LP_TOKEN_SYMBOL = "saddleTBTC-V3"
const INITIAL_A = 100
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 50e8

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const metaPool = await getOrNull(META_POOL_NAME)
  if (metaPool) {
    log(`reusing ${META_POOL_NAME} at ${metaPool.address}`)
  } else {
    const TOKEN_ADDRESSES = await Promise.all(
      TOKEN_NAMES.map(async (name) => (await get(name)).address),
    )

    const receipt = await execute(
      "SwapDeployer",
      {
        from: deployer,
        log: true,
      },
      "deployMetaSwap",
      (
        await get("MetaSwapV3")
      ).address,
      TOKEN_ADDRESSES,
      TOKEN_DECIMALS,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A,
      SWAP_FEE,
      ADMIN_FEE,
      (
        await get("LPToken")
      ).address,
      (
        await get(BASE_POOL_NAME)
      ).address,
    )

    const newPoolEvent = receipt?.events?.find(
      (e: any) => e["event"] === "NewSwapPool",
    )
    const deployedAddress = newPoolEvent["args"]["swapAddress"]
    log(
      `deployed ${META_POOL_NAME} (targeting "MetaSwapV3") at ${deployedAddress}`,
    )
    await save(META_POOL_NAME, {
      abi: (await get("MetaSwapV3")).abi,
      address: deployedAddress,
    })

    const lpTokenAddress = (await read(META_POOL_NAME, "swapStorage")).lpToken
    log(`deployed ${META_POOL_LP_TOKEN_NAME} at ${lpTokenAddress}`)

    await save(META_POOL_LP_TOKEN_NAME, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [META_POOL_NAME]
func.dependencies = ["LPToken", "TBTCMetaPoolTokens", "BTCPoolV2"]
