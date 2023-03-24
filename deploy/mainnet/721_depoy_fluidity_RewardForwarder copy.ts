import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("RewardForwarder_USDC_RootGauge_10_CommunityfUSDCPoolLPToken", {
    from: deployer,
    contract: "RewardForwarder",
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await get("RootGauge_10_CommunityfUSDCPoolLPToken")).address],
  })
}
export default func
