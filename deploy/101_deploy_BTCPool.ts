import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute, get, getOrNull, log, read } = deployments
  const { deployer } = await getNamedAccounts()

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

  const currentOwner = await read("SaddleBTCPool", "owner")
  const isBTCPoolGuarded = await read("SaddleBTCPool", "isGuarded")

  // Disable the guarded phase launch
  if (isBTCPoolGuarded) {
    if (currentOwner == deployer) {
      log(`disabling BTC pool guard from deployer ${deployer}`)
      await execute(
        "SaddleBTCPool",
        { from: deployer, log: true },
        "disableGuard",
      )
    } else {
      log(`cannot disable BTC pool guard. owner is set to ${currentOwner}`)
    }
  } else {
    log(`btc pool guard is already disabled`)
  }
}
export default func
func.tags = ["BTCPool"]
func.dependencies = ["Allowlist", "SwapUtilsGuarded", "BTCPoolTokens"]
