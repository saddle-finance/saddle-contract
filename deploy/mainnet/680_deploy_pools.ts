import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployMetaswapPools, PoolData } from "../deployUtils"

// Metaswap Inputs
const metaPools: PoolData[] = [
  // pool will deploy since a deployement is not found
  {
    poolName: "SaddleVesperFRAXBPMetaPool",
    registryName: "veFRAX-FRAX",
    basePoolName: "SaddleFRAXBPPool",
    tokenArgs: {
      veFRAX: ["veFrax", "veFRAX", "18"],
    },
    lpTokenSymbol: "saddleVEFRAXFRAXBP",
    initialA: 100,
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
