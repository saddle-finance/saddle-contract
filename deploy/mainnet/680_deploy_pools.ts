import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployMetaswapPools, PoolData } from "../deployUtils"

// Metaswap Inputs
const metaPools: PoolData[] = [
  {
    poolName: "SaddleFRAXBPVesperFRAXMetaPool",
    registryName: "vesperFRAXEarnPool-FRAXBP",
    basePoolName: "SaddleFRAXBPPool",
    tokenArgs: {
      vesperFRAXFRAXBP: ["vesperFRAXEarnPool", "veFRAX-FRAXBP", "18"],
    },
    lpTokenSymbol: "saddleFRAXBP-VesperFRAXBP",
    initialA: 500,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
    deployGauge: true,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployMetaswapPools(hre, metaPools)
}

export default func
func.tags = ["poolDeployments"]
