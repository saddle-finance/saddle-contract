import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

// Deployment Names
const BASE_POOL_NAME = "SaddleFrax3Pool"
const BASE_POOL_LP_TOKEN_NAME = `${BASE_POOL_NAME}LPToken`

// Constructor arguments
const TOKEN_NAMES = ["USDC", "USDT", "FRAX"]
const TOKEN_DECIMALS = [6, 6, 18]
const LP_TOKEN_NAME = "Saddle USDC/USDT/FRAX LP Token"
const LP_TOKEN_SYMBOL = "saddleUSDCUSDTFrax"
const INITIAL_A = 500
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 5e9 // 50% of the 3bps

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const poolContract = await getOrNull(BASE_POOL_NAME)
  if (poolContract) {
    log(`reusing ${BASE_POOL_NAME} at ${poolContract.address}`)
  } else {
    const TOKEN_ADDRESSES = await Promise.all(
      TOKEN_NAMES.map(async (name) => (await get(name)).address),
    )

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
    const deployedAddress = newPoolEvent["args"]["swapAddress"]
    log(
      `deployed ${BASE_POOL_NAME} (targeting "SwapFlashLoan") at ${deployedAddress}`,
    )
    await save(BASE_POOL_NAME, {
      abi: (await get("SwapFlashLoan")).abi,
      address: deployedAddress,
    })

    const lpTokenAddress = (await read(BASE_POOL_NAME, "swapStorage")).lpToken
    log(`${LP_TOKEN_NAME} at ${lpTokenAddress}`)

    await save(BASE_POOL_LP_TOKEN_NAME, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [BASE_POOL_NAME]
func.dependencies = [
  "SwapUtils",
  "SwapFlashLoan",
  "SwapDeployer",
  "frax3poolTokens",
]
