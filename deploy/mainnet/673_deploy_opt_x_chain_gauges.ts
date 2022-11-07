import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { convertGaugeNameToSalt, getWithName } from "../../test/testUtils"
import { CHAIN_ID } from "../../utils/network"

/*
 * Deploy Root & Child Gauges for Optimism using RootGaugeFactory.
 *
 * This script calls `RootGaugeFactory.deploy_child_gauges()` for each LPToken on Optimism chain ID.
 * This will initiate a deploy on Optimism side using AnyCallV6 which will then
 * call `RootGaugeFactory.deploy_gauge()` on Ethereum Mainnnet Chain.
 *
 * The entire process is expected to take at least 20 minutes after initial txs are
 * confirmed on Ethereum Mainnet.
 *
 * Progress can be tracked by anyswap explorer: https://anyswap.net/
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log } = deployments
  const { deployer } = await getNamedAccounts()

  const executeOptions = {
    log: true,
    from: deployer,
  }

  const lpTokenNameToRegistryName: Record<string, string> = {
    SaddleFRAXBPPoolLPToken: "FRAX-USDC-BP",
    SaddleFRAXUSDTMetaPoolLPToken: "FRAXBP-USDT",
    SaddleFRAXsUSDMetaPoolLPToken: "FRAXBP-SUSD",
    SaddleOptFRAXMetaPoolLPToken: "Frax-OptUSD",
    SaddleOptUSDPoolLPToken: "OptUSD",
    SaddleUSXFRAXBPMetaPoolLPToken: "USX-FRAXBP",
  }

  // For each LP token, call deploy_child_gauge
  for (const lpTokenName in lpTokenNameToRegistryName) {
    const lpToken = await getWithName(lpTokenName, "optimism_mainnet")
    const lpTokenRegistryName = lpTokenNameToRegistryName[lpTokenName]
    await execute(
      "RootGaugeFactory",
      executeOptions,
      "deploy_child_gauge(uint256,address,bytes32,string)",
      CHAIN_ID.OPTIMISM_MAINNET, // chainId
      lpToken.address, // lpToken address on Optimism
      convertGaugeNameToSalt(lpTokenRegistryName), // salt
      lpTokenRegistryName, // name that will be included in the gauge name
    )
  }
}
export default func
func.skip = async () => false
