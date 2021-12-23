import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ARBITRUM_MULTISIG_ADDRESS } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleArbUSDPoolV2 = await getOrNull("SaddleArbUSDPoolV2")
  if (saddleArbUSDPoolV2) {
    log(`reusing "SaddleArbUSDPool" at ${saddleArbUSDPoolV2.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("FRAX")).address,
      (await get("USDC")).address,
      (await get("USDT")).address,
    ]
    const TOKEN_DECIMALS = [18, 6, 6]
    const LP_TOKEN_NAME = "Saddle FRAX/USDC/USDT"
    const LP_TOKEN_SYMBOL = "saddleArbUSDv2"
    const INITIAL_A = 200
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    await deploy("SaddleArbUSDPoolV2", {
      from: deployer,
      log: true,
      contract: "SwapFlashLoan",
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleArbUSDPoolV2",
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

    const lpTokenAddress = (await read("SaddleArbUSDPoolV2", "swapStorage"))
      .lpToken
    log(`Saddle Arbitrum USD Pool V2 LP Token at ${lpTokenAddress}`)

    await save("SaddleArbUSDPoolV2LPToken", {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })

    await execute(
      "SaddleArbUSDPoolV2",
      { from: deployer, log: true },
      "transferOwnership",
      ARBITRUM_MULTISIG_ADDRESS,
    )
  }
}
export default func
func.tags = ["SaddleArbUSDPoolV2"]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "ArbUSDPoolV2Tokens"]
