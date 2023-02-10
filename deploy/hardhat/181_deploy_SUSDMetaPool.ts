import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const saddleSUSDMetaPool = await getOrNull("SaddleSUSDMetaPool")
  if (saddleSUSDMetaPool) {
    log(`reusing "SaddleSUSDMetaPool" at ${saddleSUSDMetaPool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("SUSD")).address,
      (await get("SaddleUSDPoolV2LPToken")).address,
    ]
    const TOKEN_DECIMALS = [18, 18]
    const LP_TOKEN_NAME = "Saddle sUSD/saddleUSD-V2"
    const LP_TOKEN_SYMBOL = "saddleSUSD"
    const INITIAL_A = 100
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0

    await deploy("SaddleSUSDMetaPool", {
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
    await save("MetaSwap", await get("SaddleSUSDMetaPool"))

    await execute(
      "SaddleSUSDMetaPool",
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

    await execute(
      "SaddleSUSDMetaPool",
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[await getChainId()],
    )

    const lpTokenAddress = (await read("SaddleSUSDMetaPool", "swapStorage"))
      .lpToken
    log(`Saddle sUSD MetaSwap LP Token at ${lpTokenAddress}`)

    await save("SaddleSUSDMetaPoolLPToken", {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["SUSDMetaPool"]
func.dependencies = [
  "SUSDMetaPoolTokens",
  "USDPoolV2",
  "MetaSwapUtils",
  "AmplificationUtils",
]
