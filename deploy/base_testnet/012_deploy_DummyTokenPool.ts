import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ZERO_ADDRESS } from "../../test/testUtils"

// Deployment Names
const POOL_NAME = "SaddleDummyPool"

const TOKEN_NAMES = ["Dummy1", "Dummy2"]
const LP_TOKEN_NAME = "Saddle Dummy1/Dummy2 LP Token"
const LP_TOKEN_SYMBOL = "SaddleDummyBP"
const INITIAL_A = 500
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 0 // 50% of the 3bps

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
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

    await deploy(POOL_NAME, {
      from: deployer,
      log: true,
      contract: "SwapV2",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtilsV2: (await get("SwapUtilsV2")).address,
        AmplificationUtilsV2: (await get("AmplificationUtilsV2")).address,
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
      [18, 18],
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A,
      SWAP_FEE,
      ADMIN_FEE,
      (
        await get("LPTokenV2")
      ).address,
    )

    const lpTokenAddress = (await read(POOL_NAME, "swapStorage")).lpToken
    log(`deployed ${poolLpTokenName} at ${lpTokenAddress}`)

    await save(poolLpTokenName, {
      abi: (await get("LPTokenV2")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [POOL_NAME]
func.dependencies = ["SwapUtilsV2"]
