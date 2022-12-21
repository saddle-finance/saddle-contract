import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

// Deployment names
const META_POOL_NAME = "SaddleSUSDMetaPoolV3"
const META_POOL_LP_TOKEN_NAME = `${META_POOL_NAME}LPToken`
const BASE_POOL_NAME = "SaddleUSDPoolV2"

// Constructor arguments
const TOKEN_NAMES = ["SUSD", `${BASE_POOL_NAME}LPToken`]
const TOKEN_DECIMALS = [18, 18]
const LP_TOKEN_NAME = "Saddle sUSD/saddleUSD-V2 V3 LP Token"
const LP_TOKEN_SYMBOL = "saddleSUSD-V3"
const INITIAL_A = 100
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 50e8

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const metaPool = await getOrNull(META_POOL_NAME)
  if (metaPool) {
    log(`reusing ${META_POOL_NAME} at ${metaPool.address}`)
  } else {
    const TOKEN_ADDRESSES = await Promise.all(
      TOKEN_NAMES.map(async (name) => (await get(name)).address),
    )

    await deploy(META_POOL_NAME, {
      from: deployer,
      log: true,
      contract: "MetaSwap",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })

    await save("MetaSwapV3", await get(META_POOL_NAME))

    await execute(
      META_POOL_NAME,
      {
        from: deployer,
        log: true,
      },
      "initializeMetaSwap",
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

    await execute(
      META_POOL_NAME,
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[await getChainId()],
    )

    const lpTokenAddress = (await read(META_POOL_NAME, "swapStorage")).lpToken
    log(`deployed ${META_POOL_LP_TOKEN_NAME} at ${lpTokenAddress}`)

    await save(`${META_POOL_LP_TOKEN_NAME}`, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [META_POOL_NAME]
func.dependencies = [
  "SUSDMetaPoolTokens",
  "USDPoolV2",
  "MetaSwapUtils",
  "AmplificationUtils",
]
