import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ZERO_ADDRESS } from "../../test/testUtils"

/*
 * Deploy the RootGaugeV2 contract
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, deploy, read, execute } = deployments
  const { deployer, crossChainDeployer } = await getNamedAccounts()

  expect(await ethers.provider.getTransactionCount(crossChainDeployer)).to.eq(
    11,
  )
  const rootGaugeV2 = await deploy("RootGaugeV2", {
    log: true,
    from: crossChainDeployer,
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
func.skip = async () => true
