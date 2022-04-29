import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { asyncForEach } from "../../test/testUtils"
import { ethers } from "hardhat"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const SaddleEvmosBTC = await getOrNull("SaddleEvmosBTC")
  if (SaddleEvmosBTC) {
    log(`reusing "EvmoswBTCTokens" at ${SaddleEvmosBTC.address}`)
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
    const ADMIN_FEE = 0

    // Ensure token decimals are correct before deploying
    // Evmos explorer has some delay in updating the decimals so double check
    await asyncForEach(TOKEN_ADDRESSES, async (tokenAddress, index) => {
      const token = await ethers.getContractAt("GenericERC20", tokenAddress)
      const decimals = await token.decimals()
      if (decimals.toNumber() !== TOKEN_DECIMALS[index]) {
        throw new Error(
          `Token ${tokenAddress} has ${decimals.toNumber()} decimals, expected ${
            TOKEN_DECIMALS[index]
          }`,
        )
      }
    })

    await execute(
      "SwapFlashLoan",
      { from: deployer, log: true, waitConfirmations: 3 },
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

    await save("SaddleEvmosBTC", {
      abi: (await get("SwapFlashLoan")).abi,
      address: (await get("SwapFlashLoan")).address,
    })

    const lpTokenAddress = (await read("SaddleEvmosBTC", "swapStorage")).lpToken
    log(`Saddle Evmos USD Pool LP Token at ${lpTokenAddress}`)

    await save("SaddleEvmosBTCLPToken", {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["SaddleEvmosBTC"]
func.dependencies = ["SwapUtils", "SwapFlashLoan", "EvmosBTCTokens"]
