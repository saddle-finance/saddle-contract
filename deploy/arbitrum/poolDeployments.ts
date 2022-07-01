import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { deployMetaswap2 } from "../deployUtils"

// Deployment names
const META_POOL_NAME = "SaddleFRAXUSDTMetaPool"
const BASE_POOL_NAME = "SaddleFRAXBPPool"

// Constructor arguments
const TOKEN_NAMES = ["USDT", `${BASE_POOL_NAME}LPToken`]
const LP_TOKEN_SYMBOL = "saddleFraxUSDT"
const INITIAL_A = 100
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 50e8

interface poolDataInput {
  hre: HardhatRuntimeEnvironment
  metaPoolName: string
  basePoolName?: string
  tokenNames: string[]
  lpTokenSymbol: string
  initialA: number
  swapFee: number
  adminFee: number
}
interface metaPoolDataInput {
  metaPoolName: string
  basePoolName: string
  tokenNames: string[]
  lpTokenSymbol: string
  initialA: number
  swapFee: number
  adminFee: number
}
let poolInputs: poolDataInput[]

// Swap Flash Loan Inputs
///////
const metaPools: metaPoolDataInput[] = [
  {
    metaPoolName: "SaddleFRAXUSDTMetaPool",
    basePoolName: "SaddleFRAXBPPool",
    tokenNames: ["USDT"], // dont need to add base pool name
    lpTokenSymbol: "saddleFraxUSDT",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
]

// Metaswap Inputs

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployMetaswap2(hre, metaPools)
}

export default func
func.tags = [META_POOL_NAME]
func.dependencies = ["LPToken", "FRAXUSDTMetaPoolTokens", "SaddleFRAXBPPool"]
