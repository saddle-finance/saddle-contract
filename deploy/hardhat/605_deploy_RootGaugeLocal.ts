import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const minterAddress = (await get("Minter")).address
  const DUMMY_LP_TOKEN_SYMBOL = "DUMMY_LP"

  await deploy("RootGaugeLocal", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      minterAddress,
      MULTISIG_ADDRESSES[await getChainId()],
      DUMMY_LP_TOKEN_SYMBOL,
      0,
      0,
      0,
    ],
  })
}

export default func
func.dependencies = ["veSDL"]
func.tags = ["RootGaugeLocal"]
