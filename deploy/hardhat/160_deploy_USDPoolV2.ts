import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const SaddleUSDPoolV2 = await getOrNull("SaddleUSDPoolV2")
  if (SaddleUSDPoolV2) {
    log(`reusing "SaddleUSDPoolV2" at ${SaddleUSDPoolV2.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("DAI")).address,
      (await get("USDC")).address,
      (await get("USDT")).address,
    ]
    const TOKEN_DECIMALS = [18, 6, 6]
    const LP_TOKEN_NAME = "Saddle DAI/USDC/USDT V2"
    const LP_TOKEN_SYMBOL = "saddleUSD-V2"
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
    const usdSwapAddress = newPoolEvent["args"]["swapAddress"]
    log(`deployed USD pool V2 (targeting "SwapFlashLoan") at ${usdSwapAddress}`)
    await save("SaddleUSDPoolV2", {
      abi: (await get("SwapFlashLoan")).abi,
      address: usdSwapAddress,
    })

    const lpTokenAddress = (await read("SaddleUSDPoolV2", "swapStorage"))
      .lpToken
    log(`USD pool V2 LP Token at ${lpTokenAddress}`)

    await save("SaddleUSDPoolV2LPToken", {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["USDPoolV2"]
func.dependencies = [
  "SwapUtils",
  "SwapDeployer",
  "SwapFlashLoan",
  "USDPoolTokens",
]
