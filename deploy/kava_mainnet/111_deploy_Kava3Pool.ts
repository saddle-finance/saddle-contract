import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ZERO_ADDRESS } from "../../test/testUtils"

// Deployment Names
const POOL_NAME = "Saddle3Pool"

// Constructor arguments
const TOKEN_NAMES = ["USDC", "USDT", "DAI"]
const LP_TOKEN_NAME = "Saddle USDC/USDT/DAI LP Token"
const LP_TOKEN_SYMBOL = "saddle3Pool"
const INITIAL_A = 500
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 5e9 // 50% of the 4bps

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()
  const poolLpTokenName = `${POOL_NAME}LPToken`

  // Manually check if the pool is already deployed
  const poolContract = await getOrNull(POOL_NAME)

  // Check if has been initialized
  const isInitialized: boolean = poolContract
    ? (await read(POOL_NAME, "swapStorage")).lpToken !== ZERO_ADDRESS
    : false

  if (poolContract && isInitialized) {
    log(`reusing ${POOL_NAME} at ${poolContract.address}`)
  } else {
    const TOKEN_ADDRESSES = await Promise.all(
      TOKEN_NAMES.map(async (name) => (await get(name)).address),
    )
    const tokenDecimals = await Promise.all(
      TOKEN_NAMES.map(async (name) => await read(name, "decimals")),
    )

    await deploy(POOL_NAME, {
      from: deployer,
      log: true,
      contract: "SwapFlashLoan",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })
    await execute(
      POOL_NAME,
      {
        from: deployer,
        log: true,
      },
      "initialize",
      TOKEN_ADDRESSES,
      tokenDecimals,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A,
      SWAP_FEE,
      ADMIN_FEE,
      (
        await get("LPToken")
      ).address,
    )

    const lpTokenAddress = (await read(POOL_NAME, "swapStorage")).lpToken
    log(`deployed ${poolLpTokenName} at ${lpTokenAddress}`)

    await save(poolLpTokenName, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [POOL_NAME]
func.dependencies = [
  "SwapUtils",
  "SwapFlashLoan",
  "SwapDeployer",
  "saddle3poolTokens",
]
