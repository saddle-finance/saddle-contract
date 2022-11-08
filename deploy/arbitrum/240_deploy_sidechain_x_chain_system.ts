import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployCrossChainSystemOnSideChain } from "../deployUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployCrossChainSystemOnSideChain(hre)
}
export default func
func.skip = async () => true
