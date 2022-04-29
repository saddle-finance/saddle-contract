import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { asyncForEach } from "../../test/testUtils"
import { ethers } from "hardhat"
import { GenericERC20 } from "../../build/typechain"

// Contract names saved as deployments json files
const BTC_POOL_NAME = "SaddleEvmosBTCPool"
const BTC_POOL_LP_TOKEN_NAME = `${BTC_POOL_NAME}LPToken`

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, get, getOrNull, log, read, save, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const SaddleEvmosBTC = await getOrNull(BTC_POOL_NAME)
  if (SaddleEvmosBTC) {
    log(`reusing "${BTC_POOL_NAME}" at ${SaddleEvmosBTC.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("WBTC")).address,
      (await get("RENBTC")).address,
    ]
    const TOKEN_DECIMALS = [8, 8]
    const LP_TOKEN_NAME = "Saddle wBTC/renBTC"
    const LP_TOKEN_SYMBOL = "saddleEvmosWRenBTC"
    const INITIAL_A = 400
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 50e8 // 50%

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

    await deploy(BTC_POOL_NAME, {
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
      BTC_POOL_NAME,
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

    const lpTokenAddress = (await read(BTC_POOL_NAME, "swapStorage")).lpToken
    log(`Saddle Evmos USD Pool LP Token at ${lpTokenAddress}`)

    await save(BTC_POOL_LP_TOKEN_NAME, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = [BTC_POOL_NAME]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "EvmosBTCTokens"]
