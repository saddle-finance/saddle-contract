import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  deployMetaswapPools,
  deploySwapFlashLoanPools,
  PoolData,
} from "../deployUtils"

// Metaswap Inputs
const basePools: PoolData[] = [
  {
    poolName: "SaddleBTCBPPool",
    registryName: "BTC Base Pool",
    basePoolName: "SaddleBTCBPPool",
    tokenArgs: {
      WBTC: ["WBTC", "WBTC", "8"],
      SBTC: ["SBTC", "SBTC", "18"],
    },
    lpTokenSymbol: "saddleBTCBP",
    initialA: 500,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
    deployGauge: true,
  },
]

const metaPools: PoolData[] = [
  {
    poolName: "SaddleBPTBTCv2MetaPool",
    registryName: "BTCBP-tBTCv2 Meta Pool",
    basePoolName: "SaddleBTCBPPool",
    tokenArgs: {
      TBTCv2: ["TBTCv2", "TBTCv2", "18"],
    },
    lpTokenSymbol: "saddleBTCBP-tBTCv2",
    initialA: 500,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
    deployGauge: true,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deploySwapFlashLoanPools(hre, basePools, false)
  await deployMetaswapPools(hre, metaPools, false)
}

export default func
func.tags = ["poolDeployments"]
