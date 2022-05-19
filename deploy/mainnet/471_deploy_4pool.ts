import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

// Contract names saved as deployments json files
const FRAX4POOL_NAME = "Saddle4Pool"
const FRAX4POOL_LP_TOKEN_NAME = `${FRAX4POOL_NAME}LPToken`

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddle4pool = await getOrNull(FRAX4POOL_NAME)
  if (saddle4pool) {
    log(`reusing "4poolTokens" at ${saddle4pool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("DAI")).address,
      (await get("USDC")).address,
      (await get("USDT")).address,
      (await get("FRAX")).address,
    ]
    const TOKEN_DECIMALS = [18, 6, 6, 18]
    const LP_TOKEN_NAME = "Saddle DAI/USDC/USDT/FRAX"
    const LP_TOKEN_SYMBOL = "saddle4pool"
    const INITIAL_A = 500
    const SWAP_FEE = 3e6 // 3bps
    const ADMIN_FEE = 5e9 // 50% of the 3bps

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
    const frax4poolSwapAddress = newPoolEvent["args"]["swapAddress"]
    log(
      `deployed saddle4pool (targeting "SwapFlashLoan") at ${frax4poolSwapAddress}`,
    )
    await save("Saddle4Pool", {
      abi: (await get("SwapFlashLoan")).abi,
      address: frax4poolSwapAddress,
    })
  }

  const lpTokenAddress = (await read("Saddle4Pool", "swapStorage")).lpToken
  log(`Saddle 4Pool LP Token at ${lpTokenAddress}`)

  await save(FRAX4POOL_LP_TOKEN_NAME, {
    abi: (await get("LPToken")).abi, // LPToken ABI
    address: lpTokenAddress,
  })
}

export default func
func.tags = [FRAX4POOL_NAME]
func.dependencies = [
  "SwapUtils",
  "SwapFlashLoan",
  "SwapDeployer",
  "4poolTokens",
]
