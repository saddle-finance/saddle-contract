import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get, execute, getOrNull, log, save, read } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()

  const POOL_NAME = "SaddleArbUSDSMetaPool"
  const BASE_POOL_NAME = "SaddleArbUSDPoolV2"

  const TOKEN_ADDRESSES = [
    (await get("USDs")).address,
    (await get("SaddleArbUSDPoolV2LPToken")).address,
  ]
  const TOKEN_DECIMALS = [18, 18]
  const LP_TOKEN_NAME = "Saddle USD Metapool: USDs-saddleArbUSDv2"
  const LP_TOKEN_SYMBOL = "USDs-saddleArbUSDv2"
  const INITIAL_A = 100
  const SWAP_FEE = 4e6 // 4bps
  const ADMIN_FEE = 0

  // Manually check if the pool is already deployed
  const metaPool = await getOrNull(POOL_NAME)
  if (metaPool) {
    log(`reusing ${POOL_NAME} at ${metaPool.address}`)
  } else {
    await execute(
      "MetaSwap",
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
        await get(BASE_POOL_NAME)
      ).address,
    )

    await save(POOL_NAME, {
      abi: (await get("MetaSwap")).abi, // MetaSwap ABI
      address: (await get("MetaSwap")).address, // MetaSwap address"),
    })

    const lpTokenAddress = (await read(POOL_NAME, "swapStorage")).lpToken
    log(`Saddle sUSD MetaSwap LP Token at ${lpTokenAddress}`)

    await save(`${POOL_NAME}LPToken`, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
