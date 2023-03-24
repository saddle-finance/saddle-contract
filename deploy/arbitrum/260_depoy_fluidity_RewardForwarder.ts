import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("RewardForwarder_fUSDC_ChildGauge_CommunityfUSDCPoolLPToken", {
    from: deployer,
    contract: "RewardForwarder",
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await get("ChildGauge_CommunityfUSDCPoolLPToken")).address],
  })
}
export default func
