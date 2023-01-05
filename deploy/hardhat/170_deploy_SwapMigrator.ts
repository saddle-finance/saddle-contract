import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { get, deploy } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const oldUSDPool = await get("SaddleUSDPool")
  const oldUSDPoolLPToken = await get("SaddleUSDPoolLPToken")
  const newUSDPool = await get("SaddleUSDPoolV2")
  const newUSDPoolLPToken = await get("SaddleUSDPoolV2LPToken")

  const DAI = await get("DAI")
  const USDC = await get("USDC")
  const USDT = await get("USDT")

  const usdDataStruct = {
    oldPoolAddress: oldUSDPool.address,
    oldPoolLPTokenAddress: oldUSDPoolLPToken.address,
    newPoolAddress: newUSDPool.address,
    newPoolLPTokenAddress: newUSDPoolLPToken.address,
    underlyingTokens: [DAI.address, USDC.address, USDT.address],
  }

  const owner = isTestNetwork(await getChainId())
    ? deployer
    : MULTISIG_ADDRESSES[await getChainId()]

  await deploy("SwapMigrator", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [usdDataStruct, owner],
  })
}
export default func
func.tags = ["SwapMigrator"]
func.dependencies = ["USDPoolV2"]
