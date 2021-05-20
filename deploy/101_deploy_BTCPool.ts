import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, log, read, save, execute, getOrNull } = deployments
  const { deployer } = await getNamedAccounts()

  const saddleBTCPool = await getOrNull("SaddleBTCPool")
  if (saddleBTCPool) {
    log(`reusing "SaddleBTCPool" at ${saddleBTCPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("TBTC")).address,
      (await get("WBTC")).address,
      (await get("RENBTC")).address,
      (await get("SBTC")).address,
    ]
    const TOKEN_DECIMALS = [18, 8, 8, 18]
    const LP_TOKEN_NAME = "Saddle tBTC/WBTC/renBTC/sBTC"
    const LP_TOKEN_SYMBOL = "saddleTWRenSBTC"
    const INITIAL_A = 200
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0
    const WITHDRAW_FEE = 0

    await deploy("SaddleBTCPool", {
      from: deployer,
      log: true,
      contract: "Swap",
      libraries: {
        AmplificationUtils: (await get("AmplificationUtils")).address,
        SwapUtils: (await get("SwapUtils")).address,
      },
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "SaddleBTCPool",
      { from: deployer, log: true },
      "initialize",
      TOKEN_ADDRESSES,
      TOKEN_DECIMALS,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A,
      SWAP_FEE, // 4bps
      ADMIN_FEE,
      WITHDRAW_FEE,
      (await get("LPToken")).address,
    )

    const lpTokenAddress = (await read("SaddleBTCPool", "swapStorage")).lpToken
    log(`BTC pool LP Token at ${lpTokenAddress}`)

    await save("SaddleBTCPoolLPToken", {
      abi: (await get("TBTC")).abi, // Generic ERC20 ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["BTCPool"]
func.dependencies = [
  "Swap",
  "SwapUtils",
  "BTCPoolTokens",
  "SwapDeployer",
  "LPToken",
]
