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
      "Gauge",
      BIG_NUMBER_1E18,
    )
  }

  const minterAddress = (await get("Minter")).address
  const lpTokensAndWeights = [
    { lpToken: "SaddleALETHPoolLPToken", initialWeight: 0 },
    { lpToken: "SaddleBTCPoolV2LPToken", initialWeight: 0 },
    { lpToken: "SaddleD4PoolLPToken", initialWeight: 0 },
    { lpToken: "SaddleUSDPoolV2LPToken", initialWeight: 0 },
    { lpToken: "SaddleTBTCMetaPoolV3LPToken", initialWeight: 0 },
    { lpToken: "SaddleSUSDMetaPoolV3LPToken", initialWeight: 0 },
    { lpToken: "SaddleWCUSDMetaPoolV3LPToken", initialWeight: 0 },
    { lpToken: "SaddleFrax3PoolLPToken", initialWeight: 0 },
  ]

  for (const lpTokenAndWeight of lpTokensAndWeights) {
    const lpToken = lpTokenAndWeight.lpToken
    const initialWeight = lpTokenAndWeight.initialWeight
    const deploymentName = `LiquidityGaugeV5_${lpToken}`
    const lpTokenAddress = (await get(lpToken)).address

    if ((await getOrNull(deploymentName)) == null) {
      const result = await deploy(deploymentName, {
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
        "add_gauge(address,int128)",
        result.address,
        initialWeight,
      )
    } else {
      log(
        `${deploymentName} already deployed. Assuming it was already added to GaugeController.`,
      )
    }
  }
}
export default func
