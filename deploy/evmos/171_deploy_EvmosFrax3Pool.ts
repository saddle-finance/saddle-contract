import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { asyncForEach } from "../../test/testUtils"
import { ethers } from "hardhat"
import { GenericERC20 } from "../../build/typechain"

// Contract names saved as deployments json files
const BASE_POOL_NAME = "SaddleEvmosFrax3Pool"
const BASE_POOL_LP_TOKEN_NAME = `${BASE_POOL_NAME}LPToken`

// Constructor arguments
const TOKEN_NAMES = ["USDC", "USDT", "FRAX"]
const TOKEN_DECIMALS = [6, 6, 18]
const LP_TOKEN_NAME = "Saddle madUSDC/madUSDT/FRAX LP Token"
const LP_TOKEN_SYMBOL = "saddleEvmosFrax3pool"
const INITIAL_A = 400
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 5e9 // 50% of the 4bps

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, get, getOrNull, log, read, save, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const basePool = await getOrNull(BASE_POOL_NAME)
  if (basePool) {
    log(`reusing ${BASE_POOL_NAME} at ${basePool.address}`)
  } else {
    const TOKEN_ADDRESSES = await Promise.all(
      TOKEN_NAMES.map(async (name) => (await get(name)).address),
    )

    // Ensure token decimals are correct before deploying
    // Evmos explorer has some delay in updating the decimals so double check
    await asyncForEach(TOKEN_ADDRESSES, async (tokenAddress, index) => {
      const token = (await ethers.getContractAt(
        "GenericERC20",
        tokenAddress,
      )) as GenericERC20
      const decimals = await token.decimals()
      if (decimals !== TOKEN_DECIMALS[index]) {
        throw new Error(
          `Token ${tokenAddress} has ${decimals} decimals, expected ${TOKEN_DECIMALS[index]}`,
        )
      } else {
        log(`Confirmed token ${tokenAddress} has ${decimals} decimals`)
      }
    })

    await deploy(BASE_POOL_NAME, {
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
      BASE_POOL_NAME,
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

    const lpTokenAddress = (await read(BASE_POOL_NAME, "swapStorage")).lpToken
    log(`deployed ${BASE_POOL_LP_TOKEN_NAME} at ${lpTokenAddress}`)

    await save(BASE_POOL_LP_TOKEN_NAME, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [BASE_POOL_NAME]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "EvmosFrax3poolTokens"]
