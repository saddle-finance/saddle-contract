import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { BIG_NUMBER_1E18 } from "../../test/testUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  // read n_gauge_types
  const n_gauge_types = await read("GaugeController", "n_gauge_types")
  if (n_gauge_types.toNumber() < 1) {
    // add a new gauge type
    await execute(
      "GaugeController",
      { from: deployer, log: true },
      "add_type(string,uint256)",
      "Liquidity",
      BIG_NUMBER_1E18,
    )
  }

  const minterAddress = (await get("Minter")).address
  const newGaugeArr = [
    { lpToken: "SaddleALETHPoolLPToken", gaugeType: 0, initialWeight: 1 },
    { lpToken: "SaddleBTCPoolV2LPToken", gaugeType: 0, initialWeight: 2 },
    { lpToken: "SaddleD4PoolLPToken", gaugeType: 0, initialWeight: 3 },
    { lpToken: "SaddleUSDPoolV2LPToken", gaugeType: 0, initialWeight: 4 },
    { lpToken: "SaddleTBTCMetaPoolV3LPToken", gaugeType: 0, initialWeight: 5 },
    { lpToken: "SaddleSUSDMetaPoolV3LPToken", gaugeType: 0, initialWeight: 6 },
    { lpToken: "SaddleWCUSDMetaPoolV3LPToken", gaugeType: 0, initialWeight: 7 },
    { lpToken: "SaddleFrax3PoolLPToken", gaugeType: 0, initialWeight: 8 },
    { lpToken: "SushiSwapPairSDLWETH", gaugeType: 0, initialWeight: 9 },
  ]

  for (const newGauge of newGaugeArr) {
    const lpToken = newGauge.lpToken
    const deploymentName = `LiquidityGaugeV5_${lpToken}`
    const lpTokenAddress = (await get(lpToken)).address

    if ((await getOrNull(deploymentName)) == null) {
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

      await execute(
        "GaugeController",
        { from: deployer, log: true },
        "add_gauge(address,int128,uint256)",
        gaugeDeploymentResult.address,
        newGauge.gaugeType,
        newGauge.initialWeight,
      )
    } else {
      log(
        `${deploymentName} already deployed. Assuming it was already added to GaugeController.`,
      )
    }
  }
}
export default func
