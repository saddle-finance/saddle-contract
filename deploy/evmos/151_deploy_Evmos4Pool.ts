import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { asyncForEach } from "../../test/testUtils"
import { ethers } from "hardhat"
import { GenericERC20 } from "../../build/typechain"

// Contract names saved as deployments json files
const FRAX4POOL_NAME = "SaddleEvmos4Pool"
const FRAX4POOL_LP_TOKEN_NAME = `${FRAX4POOL_NAME}LPToken`

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, get, getOrNull, log, read, save, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const saddleEvmos4pool = await getOrNull("SaddleEvmos4pool")
  if (saddleEvmos4pool) {
    log(`reusing "Evmos4poolTokens" at ${saddleEvmos4pool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("DAI")).address,
      (await get("USDC")).address,
      (await get("USDT")).address,
      (await get("FRAX")).address,
    ]
    const TOKEN_DECIMALS = [18, 6, 6, 18]
    const LP_TOKEN_NAME = "Saddle 4pool"
    const LP_TOKEN_SYMBOL = "saddleEvmos4pool"
    const INITIAL_A = 400
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 5e9 // 50% of the 4bps

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

    await deploy(FRAX4POOL_NAME, {
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
      FRAX4POOL_NAME,
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

    const lpTokenAddress = (await read(FRAX4POOL_NAME, "swapStorage")).lpToken
    log(`Saddle Evmos 4Pool LP Token at ${lpTokenAddress}`)

    await save(FRAX4POOL_LP_TOKEN_NAME, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [FRAX4POOL_NAME]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "Evmos4poolTokens"]
