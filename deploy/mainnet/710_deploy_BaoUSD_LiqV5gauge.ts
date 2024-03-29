import { parseUnits } from "ethers/lib/utils"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const minterAddress = (await get("Minter")).address

  // LP token deployments to add LiqV5 gauges
  const newGaugeArr = [
    {
      lpToken: "SaddleFraxBPBaoUSDMetaPoolLPToken",
      gaugeType: 0,
      initialWeight: 0,
    },
  ]

  for (let i = 0; i < newGaugeArr.length; i++) {
    const newGauge = newGaugeArr[i]
    const lpToken = newGauge.lpToken
    const deploymentName = `LiquidityGaugeV5_${lpToken}`
    const lpTokenAddress = (await get(lpToken)).address

    await deploy(deploymentName, {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      contract: "LiquidityGaugeV5",
      args: [
        lpTokenAddress,
        minterAddress,
        MULTISIG_ADDRESSES[await getChainId()],
      ],
      maxFeePerGas: parseUnits("20.0", "gwei"),
      maxPriorityFeePerGas: parseUnits("1.5", "gwei"),
      gasLimit: 2824434,
    })
  }
}
export default func
