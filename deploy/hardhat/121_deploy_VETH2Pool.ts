import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, read, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Manually check if the pool is already deployed
  const saddleVETH2Pool = await getOrNull("SaddleVETH2Pool")
  if (saddleVETH2Pool) {
    log(`reusing "SaddleVETH2Pool" at ${saddleVETH2Pool.address}`)
  } else {
    // Constructor arguments
    const TOKEN_ADDRESSES = [
      (await get("WETH")).address,
      (await get("VETH2")).address,
    ]
    const TOKEN_DECIMALS = [18, 18]
    const LP_TOKEN_NAME = "Saddle WETH/vETH2"
    const LP_TOKEN_SYMBOL = "saddleVETH2"
    const INITIAL_A = 10
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 0
    const WITHDRAW_FEE = 0

    const receipt = await execute(
      "SwapDeployerV1",
      { from: deployer, log: true },
      "deploy",
      (
        await get("SwapFlashLoanV1")
      ).address,
      TOKEN_ADDRESSES,
      TOKEN_DECIMALS,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A,
      SWAP_FEE,
      ADMIN_FEE,
      WITHDRAW_FEE,
      (
        await get("LPTokenV1")
      ).address,
    )

    const newPoolEvent = receipt?.events?.find(
      (e: any) => e["event"] == "NewSwapPool",
    )
    const veth2SwapAddress = newPoolEvent["args"]["swapAddress"]
    log(
      `deployed vETH2 pool (targeting "SwapFlashLoanV1") at ${veth2SwapAddress}`,
    )
    await save("SaddleVETH2Pool", {
      abi: (await get("SwapFlashLoanV1")).abi,
      address: veth2SwapAddress,
    })

    const lpTokenAddress = (await read("SaddleVETH2Pool", "swapStorage"))
      .lpToken
    log(`vETH2 pool LP Token at ${lpTokenAddress}`)

    await save("SaddleVETH2PoolLPToken", {
      abi: (await get("TBTC")).abi, // Generic ERC20 ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["VETH2Pool"]
func.dependencies = [
  "SwapUtils",
  "SwapDeployer",
  "SwapFlashLoan",
  "VETH2PoolTokens",
]
