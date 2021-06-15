import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleSUSDMetaPool = await getOrNull("SaddleSUSDMetaPool")
  if (saddleSUSDMetaPool) {
    log(`reusing "SaddleSUSDMetaPool" at ${saddleSUSDMetaPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("SUSD")).address,
      (await get("SaddleUSDPoolLPToken")).address,
    ]
    const TOKEN_DECIMALS = [18, 18]
    const LP_TOKEN_NAME = "Saddle sUSD/saddleUSD"
    const LP_TOKEN_SYMBOL = "saddleSUSD"
    const INITIAL_A = 200
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    await deploy("SaddleSUSDMetaPool", {
      from: deployer,
      log: true,
      contract: "MetaSwap",
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleSUSDMetaPool",
      { from: deployer, log: true, gasLimit: 5000000 },
      "initializeMetaSwap",
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
      (
        await get("SaddleUSDPool")
      ).address,
    )
  }

  const lpTokenAddress = (await read("SaddleSUSDMetaPool", "swapStorage"))
    .lpToken
  log(`sUSD meta pool LP Token at ${lpTokenAddress}`)

  await save("SaddleSUSDMetaPoolLPToken", {
    abi: (await get("TBTC")).abi, // Generic ERC20 ABI
    address: lpTokenAddress,
  })
}
export default func
func.tags = ["SUSDMetaPool"]
func.dependencies = [
  "AmplificationUtils",
  "MetaSwapUtils",
  "MetaSUSDPoolTokens",
  "SwapUtils",
]
