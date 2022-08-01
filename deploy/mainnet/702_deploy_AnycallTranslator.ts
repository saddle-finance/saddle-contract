import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const anyCallTranslator = await deploy("AnycallTranslator", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "AnycallTranslator",
    // will be child gauge facotry on other chains
    // set as owner so only this contract may make anycalls
    args: [(await get("RootGaugeFactory")).address],
  })
}
export default func
func.tags = ["AnycallTranslator"]
