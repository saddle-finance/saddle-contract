import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ZERO_ADDRESS } from "../../test/testUtils"

/*
 * Deploy the ChildGauge contract on nonce 7 from cross chain deployer account
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log, save, read, rawTx } = deployments
  const { deployer, crossChainDeployer } = await getNamedAccounts()

  expect(await ethers.provider.getTransactionCount(crossChainDeployer)).to.eq(
    11,
  )

  // Deploy ChildGauge to sync with mainnet RootGaugeV2 address
  const cg = await deploy("ChildGaugeV2", {
    contract: "ChildGauge",
    log: true,
    from: crossChainDeployer,
    args: [
      (await get("SDL")).address,
      (await get("ChildGaugeFactory")).address,
    ],
    skipIfAlreadyDeployed: true,
  })
  expect(await read("ChildGauge", "factory")).not.eq(ZERO_ADDRESS)

  // Update implementation address
  // await execute(
  //   "ChildGaugeFactory",
  //   { log: true, from: deployer },
  //   "set_implementation",
  //   cg.address,
  // )
}
export default func
func.skip = async () => true
