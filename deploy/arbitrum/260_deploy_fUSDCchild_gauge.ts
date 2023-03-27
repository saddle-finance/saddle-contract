import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployChildGauges } from "../deployUtils"

/**
 * @notice Deploy the child gauges on Arbitrum
 * @param hre HardhatRuntimeEnvironment
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Deploy the child gauges using registry
  await deployChildGauges(
    hre,
    { CommunityfUSDCPoolLPToken: "fUSDC-USDC pool" },
    true,
  )
}
export default func
// Should be commented out after deployment
// func.skip = async () => true
