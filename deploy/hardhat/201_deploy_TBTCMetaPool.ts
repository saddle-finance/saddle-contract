import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const saddleTBTCMetaPool = await getOrNull("SaddleTBTCMetaPool")
  if (saddleTBTCMetaPool) {
    log(`reusing "SaddleTBTCMetaPool" at ${saddleTBTCMetaPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("TBTCv2")).address,
      (await get("SaddleBTCPoolV2LPToken")).address,
    ]
    const TOKEN_DECIMALS = [18, 18]
    const LP_TOKEN_NAME = "Saddle tBTCv2/saddleWRenSBTC"
    const LP_TOKEN_SYMBOL = "saddletBTC"
    const INITIAL_A = 100
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    const receipt = await execute(
      "SwapDeployer",
      {
        from: deployer,
        log: true,
      },
      "deployMetaSwap",
      (
        await get("SaddleSUSDMetaPool")
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
        await get("SaddleBTCPoolV2")
      ).address,
    )

    const newPoolEvent = receipt?.events?.find(
      (e: any) => e["event"] == "NewSwapPool",
    )
    const btcSwapAddress = newPoolEvent["args"]["swapAddress"]
    log(`deployed TBTC meta pool (targeting "MetaSwap") at ${btcSwapAddress}`)
    await save("SaddleTBTCMetaPool", {
      abi: (await get("SaddleSUSDMetaPool")).abi,
      address: btcSwapAddress,
    })

    const lpTokenAddress = (await read("SaddleTBTCMetaPool", "swapStorage"))
      .lpToken
    log(`Saddle tBTC v2 MetaSwap LP Token at ${lpTokenAddress}`)

    await save("SaddleTBTCMetaPoolLPToken", {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["TBTCMetaPool"]
func.dependencies = [
  "LPToken",
  "USDMetaPool",
  "TBTCMetaPoolTokens",
  "BTCPoolV2",
]
