import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployChildGauges } from "../deployUtils"

/**
 * @notice Deploy the child gauges on Arbitrum
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Record of lp token deployment name to registry name
  const lpTokenNameToRegistryName: Record<string, string> = {
    SaddleArbUSDPoolLPToken: "ArbUSD",
    SaddleArbUSDPoolV2LPToken: "ArbUSDV2",
    SaddleArbUSDSMetaPoolLPToken: "USDS-ArbUSDV2",
    SaddleFRAXBPPoolLPToken: "FRAX-USDC-BP",
    SaddleFRAXUSDTMetaPoolLPToken: "FRAXBP-USDT",
    SaddleFRAXUSDsMetaPoolLPToken: "FRAXBP-USDs",
    SaddleUSXFRAXBPMetaPoolLPToken: "USX-FRAXBP",
    CommunityfUSDCPoolLPToken: "fUSDC-USDC pool",
  }

  // Deploy the child gauges using above mapping
  await deployChildGauges(hre, lpTokenNameToRegistryName, true)
}
export default func
func.skip = async () => true
