import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const SaddleBTCPoolV2 = await getOrNull("SaddleBTCPoolV2")
  if (SaddleBTCPoolV2) {
    log(`reusing "SaddleBTCPoolV2" at ${SaddleBTCPoolV2.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("WBTC")).address,
      (await get("RENBTC")).address,
      (await get("SBTC")).address,
    ]
    const TOKEN_DECIMALS = [8, 8, 18]
    const LP_TOKEN_NAME = "Saddle WBTC/renBTC/sBTC"
    const LP_TOKEN_SYMBOL = "saddleWRenSBTC"
    const INITIAL_A = 200
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    const receipt = await execute(
      "SwapDeployer",
      { from: deployer, log: true },
      "deploy",
      (
        await get("SwapFlashLoan")
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
    )

    const newPoolEvent = receipt?.events?.find(
      (e: any) => e["event"] == "NewSwapPool",
    )
    const btcSwapAddress = newPoolEvent["args"]["swapAddress"]
    log(`deployed BTC pool V2 (targeting "SwapFlashLoan") at ${btcSwapAddress}`)
    await save("SaddleBTCPoolV2", {
      abi: (await get("SwapFlashLoan")).abi,
      address: btcSwapAddress,
    })

    const lpTokenAddress = (await read("SaddleBTCPoolV2", "swapStorage"))
      .lpToken
    log(`BTC pool V2 LP Token at ${lpTokenAddress}`)

    await save("SaddleBTCPoolV2LPToken", {
      abi: (await get("WBTC")).abi, // Generic ERC20 ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["BTCPoolV2"]
func.dependencies = [
  "SwapUtils",
  "SwapDeployer",
  "SwapFlashLoan",
  "BTCPoolV2Tokens",
]
