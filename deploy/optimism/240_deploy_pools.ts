import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployMetaswapPools, PoolData } from "../deployUtils"

// Metaswap Inputs
const metaPools: PoolData[] = [
  // pool will deploy since a deployement is not found
  {
    poolName: "SaddleUSXFRAXBPMetaPool",
    registryName: "USX-FRAXBP",
    basePoolName: "SaddleFRAXBPPool",
    tokenArgs: {
      USX: ["dForce USD", "USX", "18"],
    },
    lpTokenSymbol: "saddleUSXFRAXBP",
    initialA: 500,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployMetaswapPools(hre, metaPools)
}

export default func
func.tags = ["poolDeployments"]
