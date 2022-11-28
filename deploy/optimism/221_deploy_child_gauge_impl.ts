import { expect } from "chai"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ZERO_ADDRESS } from "../../test/testUtils"

/**
 * @notice Deploy the ChildGauge contract on nonce 7 from cross chain deployer account
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

  // nonce 6: Place holder
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

  // nonce 7: Re-deploy ChildGauge
  const cg = await deploy("ChildGauge", {
    ...xChainFactoryDeployOptions,
    args: [
      (await get("SDL")).address,
      (await get("ChildGaugeFactory")).address,
    ],
  })
  expect(await read("ChildGauge", "factory")).not.eq(ZERO_ADDRESS)

  // Update implementation address
  await execute(
    "ChildGaugeFactory",
    executeOptions,
    "set_implementation",
    cg.address,
  )
}
export default func
func.skip = async () => true
