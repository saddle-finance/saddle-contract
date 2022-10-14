import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy(
    "RewardForwarder_VSP_LiquidityGaugeV5_SaddleFRAXBPVesperFRAXMetaPoolLPToken",
    {
      from: deployer,
      contract: "RewardForwarder",
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
        (
          await get("LiquidityGaugeV5_SaddleFRAXBPVesperFRAXMetaPoolLPToken")
        ).address,
      ],
    },
  )
}
export default func
