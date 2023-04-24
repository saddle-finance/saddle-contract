import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ZERO_ADDRESS } from "../../test/testUtils"

/*
 * Deploy the RootGaugeV2 contract
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { get, deploy, read } = deployments
  const { deployer } = await getNamedAccounts()
  
  // Deploy RootGauge
  const rootGaugeV2 = await deploy("RootGaugeV2", {
    log: true,
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("SDL")).address,
      (await get("GaugeController")).address,
      (await get("Minter")).address,
    ],
  })
  expect(await read("RootGaugeV2", "factory")).not.eq(ZERO_ADDRESS)
}
export default func
// func.skip = async () => true
