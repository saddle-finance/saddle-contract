import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployChildGauges } from "../deployUtils"

/**
 * @notice Deploy the child gauges on Optimism
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Record of lp token deployment name to registry name
  const lpTokenNameToRegistryName: Record<string, string> = {
    SaddleFRAXBPPoolLPToken: "FRAX-USDC-BP",
    SaddleFRAXUSDTMetaPoolLPToken: "FRAXBP-USDT",
    SaddleFRAXsUSDMetaPoolLPToken: "FRAXBP-SUSD",
    SaddleOptFRAXMetaPoolLPToken: "Frax-OptUSD",
    SaddleOptUSDPoolLPToken: "OptUSD",
    SaddleUSXFRAXBPMetaPoolLPToken: "USX-FRAXBP",
  }
  // Deploy the child gauges using above mapping
  await deployChildGauges(hre, lpTokenNameToRegistryName, true)
}
export default func
func.skip = async () => true
