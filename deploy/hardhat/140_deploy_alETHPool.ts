import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const SaddleALETHPool = await getOrNull("SaddleALETHPool")
  if (SaddleALETHPool) {
    log(`reusing "SaddleALETHPool" at ${SaddleALETHPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("WETH")).address,
      (await get("ALETH")).address,
      (await get("SETH")).address,
    ]
    const TOKEN_DECIMALS = [18, 18, 18]
    const LP_TOKEN_NAME = "Saddle WETH/alETH/sETH"
    const LP_TOKEN_SYMBOL = "saddlealETH"
    const INITIAL_A = 60
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
    const alETHSwapAddress = newPoolEvent["args"]["swapAddress"]
    log(
      `deployed alETH pool (targeting "SwapFlashLoan") at ${alETHSwapAddress}`,
    )
    await save("SaddleALETHPool", {
      abi: (await get("SwapFlashLoan")).abi,
      address: alETHSwapAddress,
    })

    const lpTokenAddress = (await read("SaddleALETHPool", "swapStorage"))
      .lpToken
    log(`alETH pool LP Token at ${lpTokenAddress}`)

    await save("SaddleALETHPoolLPToken", {
      abi: (await get("TBTC")).abi, // Generic ERC20 ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["ALETHPool"]
func.dependencies = [
  "SwapUtils",
  "SwapDeployer",
  "SwapFlashLoan",
  "ALETHPoolTokens",
]
