import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"

const MERKLE_ROOT = {
  [CHAIN_ID.MAINNET]:
    "0xc799ec3a26ef7b4c295f6f02d1e6f65c35cef24447ff343076060bfc0eafb24e",
  [CHAIN_ID.HARDHAT]:
    "0xca0f8c7ee1addcc5fce6a7c989ba3f210db065c36c276b71b8c8253a339318a3",
  [CHAIN_ID.ROPSTEN]:
    "0xca0f8c7ee1addcc5fce6a7c989ba3f210db065c36c276b71b8c8253a339318a3",
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  await deploy("Allowlist", {
    from: deployer,
    args: [MERKLE_ROOT[await getChainId()]],
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["Allowlist"]
