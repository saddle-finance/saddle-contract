import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const minterAddress = (await get("Minter")).address

  // LP token deployments to add LiqV5 gauges for
  const newGaugeArr = [
    { lpToken: "SaddleFRAXBPPoolLPToken", gaugeType: 0, initialWeight: 0 },
    {
      lpToken: "SaddleFRAXsUSDMetaPoolLPToken",
      gaugeType: 0,
      initialWeight: 0,
    },
    {
      lpToken: "SaddleFRAXUSDTMetaPoolLPToken",
      gaugeType: 0,
      initialWeight: 0,
    },
    {
      lpToken: "SaddleFRAXalUSDMetaPoolLPToken",
      gaugeType: 0,
      initialWeight: 0,
    },
  ]

  for (let i = 0; i < newGaugeArr.length; i++) {
    const newGauge = newGaugeArr[i]
    const lpToken = newGauge.lpToken
    const deploymentName = `LiquidityGaugeV5_${lpToken}`
    const lpTokenAddress = (await get(lpToken)).address

    const gaugeDeploymentResult = await deploy(deploymentName, {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      contract: "LiquidityGaugeV5",
      args: [
        lpTokenAddress,
        minterAddress,
        MULTISIG_ADDRESSES[await getChainId()],
      ],
    })
  }
}
export default func
