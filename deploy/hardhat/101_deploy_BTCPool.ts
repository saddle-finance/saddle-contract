import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get, log, read, save, getOrNull } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  // Constructor arguments
  const TOKEN_ADDRESSES = [
    (await get("TBTC")).address,
    (await get("WBTC")).address,
    (await get("RENBTC")).address,
    (await get("SBTC")).address,
  ]
  const TOKEN_DECIMALS = [18, 8, 8, 18]
  const LP_TOKEN_NAME = "Saddle tBTC/WBTC/renBTC/sBTC"
  const LP_TOKEN_SYMBOL = "saddleTWRenSBTC"
  const INITIAL_A = 200
  const SWAP_FEE = 4e6 // 4bps
  const ADMIN_FEE = 0
  const WITHDRAW_FEE = 0
  const ALLOWLIST_ADDRESS = (await get("Allowlist")).address

  const poolDeployment = await getOrNull("SaddleBTCPool")
  if (poolDeployment) {
    log(`reusing SaddleBTCPool at ${poolDeployment.address}`)
  } else {
    await deploy("SaddleBTCPool", {
      from: deployer,
      log: true,
      contract: "SwapGuarded",
      libraries: {
        SwapUtilsGuarded: (await get("SwapUtilsGuarded")).address,
      },
      args: [
        TOKEN_ADDRESSES,
        TOKEN_DECIMALS,
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A,
        SWAP_FEE, // 4bps
        ADMIN_FEE,
        WITHDRAW_FEE,
        ALLOWLIST_ADDRESS,
      ],
      skipIfAlreadyDeployed: true,
    })

    const lpTokenAddress = (await read("SaddleBTCPool", "swapStorage")).lpToken
    log(`BTC pool LP Token at ${lpTokenAddress}`)

    await save("SaddleBTCPoolLPToken", {
      abi: (await get("TBTC")).abi, // Generic ERC20 ABI
      address: lpTokenAddress,
    })
  }
}
export default func
func.tags = ["BTCPool"]
func.dependencies = ["Allowlist", "SwapUtilsGuarded", "BTCPoolTokens"]
