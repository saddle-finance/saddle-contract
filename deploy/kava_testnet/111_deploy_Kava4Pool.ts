import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleKava4Pool = await getOrNull("SaddleKava4Pool")
  if (saddleKava4Pool) {
    log(`reusing "Evmos4PoolTokens" at ${saddleKava4Pool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("test_USDC")).address,
      (await get("test_USDT")).address,
      (await get("test_UST")).address,
      (await get("test_FRAX")).address,
    ]
    const TOKEN_DECIMALS = [18, 6, 6, 18]
    const LP_TOKEN_NAME = "Saddle 4pool"
    const LP_TOKEN_SYMBOL = "saddleKavaUSD"
    const INITIAL_A = 400
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    await execute(
      "SwapFlashLoan",
      { from: deployer, log: true, waitConfirmations: 3 },
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

    await save("SaddleKava4Pool", {
      abi: (await get("SwapFlashLoan")).abi,
      address: (await get("SwapFlashLoan")).address,
    })

    const lpTokenAddress = (await read("SaddleKava4Pool", "swapStorage"))
      .lpToken
    log(`Saddle Evmos USD Pool LP Token at ${lpTokenAddress}`)

    await save("SaddleKava4PoolLPToken", {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })

    await execute(
      "SaddleKava4Pool",
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[await getChainId()],
    )
  }
}
export default func
func.tags = ["SaddleKava4Pool"]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "Kava4PoolTokens"]
