import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { OPTIMISM_MULTISIG_ADDRESS } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const metaPool = await getOrNull("SaddleOptFRAXMetaPool")
  if (metaPool) {
    log(`reusing "SaddleOptFRAXMetaPool" at ${metaPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("FRAX")).address,
      (await get("SaddleOptUSDPoolLPToken")).address,
    ]
    const TOKEN_DECIMALS = [18, 18]
    const LP_TOKEN_NAME = "Saddle FRAX/saddleOptUSD"
    const LP_TOKEN_SYMBOL = "saddleOptFraxUSD"
    const INITIAL_A = 100
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    // This is the first time deploying MetaSwap contract.
    // Next time, we can just deploy a proxy that targets this.
    await deploy("SaddleOptFRAXMetaPool", {
      from: deployer,
      log: true,
      contract: "MetaSwap",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })

    await execute(
      "SaddleOptFRAXMetaPool",
      {
        from: deployer,
        log: true,
      },
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
        await get("SaddleOptUSDPool")
      ).address,
    )

    await execute(
      "SaddleOptFRAXMetaPool",
      { from: deployer, log: true },
      "transferOwnership",
      OPTIMISM_MULTISIG_ADDRESS,
    )
  }

  const lpTokenAddress = (await read("SaddleOptFRAXMetaPool", "swapStorage"))
    .lpToken
  log(`Saddle FRAX MetaSwap LP Token at ${lpTokenAddress}`)

  await save("SaddleOptFRAXMetaPoolLPToken", {
    abi: (await get("LPToken")).abi, // LPToken ABI
    address: lpTokenAddress,
  })
}
export default func
func.tags = ["SaddleOptFRAXMetaPool"]
func.dependencies = [
  "SaddleOptFRAXMetaPoolTokens",
  "SaddleOptUSDPool",
  "MetaSwapUtils",
  "AmplificationUtils",
]
