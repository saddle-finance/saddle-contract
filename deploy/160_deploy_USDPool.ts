import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { Receipt } from "hardhat-deploy/dist/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const oSaddleUSDPool = await getOrNull("oSaddleUSDPool")
  if (oSaddleUSDPool) {
    log(`reusing "oSaddleUSDPool" at ${oSaddleUSDPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("DAI")).address,
      (await get("USDC")).address,
      (await get("USDT")).address,
    ]
    const TOKEN_DECIMALS = [18, 6, 6]
    const LP_TOKEN_NAME = "Optimism Saddle DAI/USDC/USDT"
    const LP_TOKEN_SYMBOL = "oSaddleUSD"
    const INITIAL_A = 200
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    const receipt: Receipt = await execute(
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

    await save("oSaddleUSDPool", {
      abi: (await get("SwapFlashLoan")).abi,
      address: (await get("SwapFlashLoan")).address,
    })
  }

  const lpTokenAddress = (await read("oSaddleUSDPool", "swapStorage")).lpToken
  log(`Optimism USD pool LP Token at ${lpTokenAddress}`)

  await save("oSaddleUSDPoolLPToken", {
    abi: (await get("LPToken")).abi, // LPToken ABI
    address: lpTokenAddress,
  })
}
export default func
func.tags = ["USDPool"]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "USDPoolTokens"]
