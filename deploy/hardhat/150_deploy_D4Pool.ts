import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const SaddleD4Pool = await getOrNull("SaddleD4Pool")
  if (SaddleD4Pool) {
    log(`reusing "SaddleD4Pool" at ${SaddleD4Pool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("ALUSD")).address,
      (await get("FEI")).address,
      (await get("FRAX")).address,
      (await get("LUSD")).address,
    ]
    const TOKEN_DECIMALS = [18, 18, 18, 18]
    const LP_TOKEN_NAME = "Saddle alUSD/FEI/FRAX/LUSD"
    const LP_TOKEN_SYMBOL = "saddleD4"
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
    const D4SwapAddress = newPoolEvent["args"]["swapAddress"]
    log(`deployed D4 pool (targeting "SwapFlashLoan") at ${D4SwapAddress}`)
    await save("SaddleD4Pool", {
      abi: (await get("SwapFlashLoan")).abi,
      address: D4SwapAddress,
    })

    const lpTokenAddress = (await read("SaddleD4Pool", "swapStorage")).lpToken
    log(`D4 pool LP Token at ${lpTokenAddress}`)

    await save("SaddleD4PoolLPToken", {
      abi: (await get("TBTC")).abi, // Generic ERC20 ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["D4Pool"]
func.dependencies = [
  "SwapUtils",
  "SwapDeployer",
  "SwapFlashLoan",
  "D4PoolTokens",
]
