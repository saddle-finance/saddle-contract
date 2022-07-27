import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { RootGaugeFactory } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  // eventually be anycall translator
  const ANYCALL_PROXY = "0x37414a8662bc1d25be3ee51fb27c2686e2490a89"
  const ANYCALL_RNKEBY = "0xf8a363Cf116b6B633faEDF66848ED52895CE703b"
  const SDL = "0xf1Dc500FdE233A4055e25e5BbF516372BC4F6871"

  // deploy Root Gauge Factory
  const rootGaugeFactoryDeployment = await deploy("RootGaugeFactory", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "RootGaugeFactory",
    args: [ANYCALL_PROXY, deployer],
  })

  // deploy root gauge implementation
  const rootGaugeImplementation = await deploy("RootGaugeImplementation", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "RootGauge",
    args: [
      SDL,
      rootGaugeFactoryDeployment.address,
      (await get("Minter")).address,
    ],
  })

  // set the deployed implementation ** fails for unknown reason
  const factory = await ethers.getContract("RootGaugeFactory")
  await execute(
    "RootGaugeFactory",
    { from: deployer, log: true },
    "set_implementation",
    rootGaugeImplementation.address,
  )

  // set the bridger implementation ** fails for unknown reason
  console.log((await ethers.getContract("ArbitrumBridger")).address)
  await execute(
    "RootGaugeFactory",
    { from: deployer, log: true },
    "set_bridger",
    42161,
    (
      await ethers.getContract("ArbitrumBridger")
    ).address,
  )
}
export default func
func.dependencies = ["ArbBridger"]
