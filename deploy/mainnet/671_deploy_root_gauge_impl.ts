import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ZERO_ADDRESS } from "../../test/testUtils"

/*
 * Deploy the RootGauge contract on nonce 7 from cross chain deployer account
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, log, save, read, rawTx } = deployments
  const { deployer, crossChainDeployer } = await getNamedAccounts()

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  // 6: Place holder
  const currentNonce = await ethers.provider.getTransactionCount(
    crossChainDeployer,
  )
  // If the current nonce is at 6, send an empty tx to bump it to 7
  if (currentNonce == 6) {
    const tx = await rawTx({
      ...xChainFactoryDeployOptions,
      to: crossChainDeployer,
      value: "0",
    })
    log(
      `Spending nonce 6 from cross chain deployer: ${tx.transactionHash}: performed with ${tx.gasUsed} gas`,
    )
  } else {
    log(`Nonce 6 already spent from cross chain deployer`)
  }
  expect(await ethers.provider.getTransactionCount(crossChainDeployer)).to.eq(7)

  // 7: Re-deploy RootGauge
  const rootGauge = await deploy("RootGauge", {
    ...xChainFactoryDeployOptions,
    args: [
      (await get("SDL")).address,
      (await get("GaugeController")).address,
      (await get("Minter")).address,
    ],
  })
  expect(await read("RootGauge", "factory")).not.eq(ZERO_ADDRESS)

  // Update implementation address
  await execute(
    "RootGaugeFactory",
    executeOptions,
    "set_implementation",
    rootGauge.address,
  )
}
export default func
func.skip = async () => true
