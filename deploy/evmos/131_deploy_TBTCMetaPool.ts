import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleTBTCMetaPool = await getOrNull("SaddleTBTCMetaPool")
  if (saddleTBTCMetaPool) {
    log(`reusing "SaddleTBTCMetaPool" at ${saddleTBTCMetaPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("TBTCv2")).address,
      (await get("SaddleEvmosBTCLPToken")).address,
    ]
    const TOKEN_DECIMALS = [18, 18]
    const LP_TOKEN_NAME = "Saddle tBTCv2/saddleWRenSBTC"
    const LP_TOKEN_SYMBOL = "saddletBTC"
    const INITIAL_A = 100
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    await deploy("SaddleTBTCMetaPool", {
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

    // Save the first deployment as MetaSwapUpdated
    await save("MetaSwap", await get("SaddleTBTCMetaPool"))

    await execute(
      "SaddleTBTCMetaPool",
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
        await get("SaddleUSDPoolV2")
      ).address,
    )
  }
  const lpTokenAddress = (await read("SaddleTBTCMetaPool", "swapStorage"))
    .lpToken
  log(`Saddle tBTC MetaSwap LP Token at ${lpTokenAddress}`)

  await save("SaddleTBTCMetaPoolLPToken", {
    abi: (await get("LPToken")).abi, // LPToken ABI
    address: lpTokenAddress,
  })
}
export default func
func.tags = ["TBTCMetaPool"]
func.dependencies = [
  "LPToken",
  "TBTCMetaPoolTokens",
  "SaddleEvmosBTC",
  "MetaSwapUtils",
  "AmplificationUtils",
]
