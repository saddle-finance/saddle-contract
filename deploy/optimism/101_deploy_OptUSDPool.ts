import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { OPTIMISM_MULTISIG_ADDRESS } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleOptUSDPool = await getOrNull("SaddleOptUSDPool")
  if (saddleOptUSDPool) {
    log(`reusing "SaddleOptUSDPool" at ${saddleOptUSDPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("DAI")).address,
      (await get("USDC")).address,
      (await get("USDT")).address,
    ]
    const TOKEN_DECIMALS = [18, 6, 6]
    const LP_TOKEN_NAME = "Saddle DAI/USDC/USDT"
    const LP_TOKEN_SYMBOL = "saddleOptUSD"
    const INITIAL_A = 200
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    // Since this will be the first pool on Optimism, we initialize the target contract.
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

    await save("SaddleOptUSDPool", {
      abi: (await get("SwapFlashLoan")).abi,
      address: (await get("SwapFlashLoan")).address,
    })

    const lpTokenAddress = (await read("SaddleOptUSDPool", "swapStorage"))
      .lpToken
    log(`Saddle Optimism USD Pool LP Token at ${lpTokenAddress}`)

    await save("SaddleOptUSDPoolLPToken", {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })

    // Transfer ownership to the multisig
    await execute(
      "SaddleOptUSDPool",
      { from: deployer, log: true },
      "transferOwnership",
      OPTIMISM_MULTISIG_ADDRESS,
    )
  }
}
export default func
func.tags = ["SaddleOptUSDPool"]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "OptUSDPoolTokens"]
