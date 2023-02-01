import { expect } from "chai"
import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { BIG_NUMBER_1E18 } from "../../test/testUtils"

const ROOT_GAUGE_LOCAL_CONTRACT_NAME = "RootGaugeLocal"
const LOCALHOST_LIQUIDITY_GAUGE_TYPE_NAME = "Liquidity (localhost)"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const localhostGaugeTypeWeight = BIG_NUMBER_1E18

  // read n_gauge_types
  const n_gauge_types = await read("GaugeController", "n_gauge_types")
  if (n_gauge_types.toNumber() < 2) {
    // add a new gauge type. This type will be at index 1
    await execute(
      "GaugeController",
      { from: deployer, log: true },
      "add_type(string,uint256)",
      LOCALHOST_LIQUIDITY_GAUGE_TYPE_NAME,
      localhostGaugeTypeWeight,
    )
  }

  // Ensure the type is correctly added at index 1
  const localhostGaugeType = BigNumber.from(1)
  const localhostGaugeName = await read(
    "GaugeController",
    "gauge_type_names",
    localhostGaugeType,
  )
  expect(localhostGaugeName).to.eq(LOCALHOST_LIQUIDITY_GAUGE_TYPE_NAME)

  // Get root gauge local contract's address
  const rootGaugeLocal = (await get(ROOT_GAUGE_LOCAL_CONTRACT_NAME)).address

  // add the gauge with the localhost gauge type
  await execute(
    "GaugeController",
    { from: deployer, log: true },
    "add_gauge(address,int128)",
    rootGaugeLocal,
    localhostGaugeType,
  )
}

export default func
