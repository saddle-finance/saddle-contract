import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESS } from "../utils/accounts"
import { isTestNetwork } from "../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { get, deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const oldBTCPool = await get("SaddleBTCPool")
  const oldBTCPoolLPToken = await get("SaddleBTCPoolLPToken")
  const newBTCPool = await get("SaddleBTCPoolV2")
  const newBTCPoolLPToken = await get("SaddleBTCPoolV2LPToken")

  const TBTC = await get("TBTC")
  const WBTC = await get("WBTC")
  const RENBTC = await get("RENBTC")
  const SBTC = await get("SBTC")

  const oldUSDPool = await get("SaddleUSDPool")
  const oldUSDPoolLPToken = await get("SaddleUSDPoolLPToken")
  const newUSDPool = await get("SaddleUSDPoolV2")
  const newUSDPoolLPToken = await get("SaddleUSDPoolV2LPToken")

  const DAI = await get("DAI")
  const USDC = await get("USDC")
  const USDT = await get("USDT")

  const btcDataStruct = {
    oldPoolAddress: oldBTCPool.address,
    oldPoolLPTokenAddress: oldBTCPoolLPToken.address,
    newPoolAddress: newBTCPool.address,
    newPoolLPTokenAddress: newBTCPoolLPToken.address,
    underlyingTokens: [
      TBTC.address,
      WBTC.address,
      RENBTC.address,
      SBTC.address,
    ],
  }

  const usdDataStruct = {
    oldPoolAddress: oldUSDPool.address,
    oldPoolLPTokenAddress: oldUSDPoolLPToken.address,
    newPoolAddress: newUSDPool.address,
    newPoolLPTokenAddress: newUSDPoolLPToken.address,
    underlyingTokens: [DAI.address, USDC.address, USDT.address],
  }

  const owner = isTestNetwork(await getChainId()) ? deployer : MULTISIG_ADDRESS

  await deploy("SwapMigrator", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [btcDataStruct, usdDataStruct, owner],
  })
}
export default func
func.tags = ["SwapMigrator"]
func.dependencies = ["BTCPoolV2", "USDPoolV2"]
