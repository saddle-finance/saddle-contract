import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

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

    await execute(
      "SwapFlashLoan",
      { from: deployer, log: true },
      "initialize",
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
    log(
      `deployed USD pool V2 (targeting "SwapFlashLoan") at ${
        (await get("SwapFlashLoan")).address
      }`,
    )
    await save("SaddleUSDPoolV2", await get("SwapFlashLoan"))
  }

  const lpTokenAddress = (await read("SaddleUSDPoolV2", "swapStorage")).lpToken
  log(`USD pool V2 LP Token at ${lpTokenAddress}`)

  await save("SaddleUSDPoolV2LPToken", {
    abi: (await get("LPToken")).abi, // LPToken ABI
    address: lpTokenAddress,
  })
}
export default func
func.tags = ["USDPoolV2"]
func.dependencies = [
  "SwapUtils",
  "SwapDeployer",
  "SwapFlashLoan",
  "USDPoolTokens",
]
