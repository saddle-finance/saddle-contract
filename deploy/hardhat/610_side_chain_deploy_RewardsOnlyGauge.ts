import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

// NOTE: this script is meant to be run on a side chain

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const dummyChildChainLPToken = await deploy("DUMMY_CHILD_CHAIN_LP_TOKEN", {
    from: deployer,
    log: true,
    contract: "GenericERC20",
    args: ["Dummy LP token on child chain", "DUMMY_LP", 18],
    skipIfAlreadyDeployed: true,
  })

  await deploy("RewardsOnlyGauge", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      MULTISIG_ADDRESSES[await getChainId()],
      dummyChildChainLPToken.address,
    ],
  })
}

export default func
func.tags = ["RootGaugeLocal"]
