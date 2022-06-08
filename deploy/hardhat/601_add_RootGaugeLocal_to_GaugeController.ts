import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { BigNumber } from "ethers"

const ROOT_GAUGE_LOCAL_CONTRACT_NAME = "RootGaugeLocal"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const gaugeType = BigNumber.from(20).pow(18)

  // read n_gauge_types
  const n_gauge_types = await read("GaugeController", "n_gauge_types")
  if (n_gauge_types.toNumber() < 2) {
    // add a new gauge type
    await execute(
      "GaugeController",
      { from: deployer, log: true },
      "add_type(string,uint256)",
      "Liquidity (localhost)",
      gaugeType,
    )
  }
  
  const rootGaugeLocal = (await get(ROOT_GAUGE_LOCAL_CONTRACT_NAME)).address

  // add gauge
  await execute(
    "GaugeController",
    { from: deployer, log: true },
    "add_gauge(address,int128)",
    rootGaugeLocal,
    gaugeType,
  ) 
}

export default func
