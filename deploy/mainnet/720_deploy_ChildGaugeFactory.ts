import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  // eventually be anycall translator
  const ANYCALL_PROXY = "0x37414a8662bc1d25be3ee51fb27c2686e2490a89"
  const ANYCALL_RNKEBY = "0xf8a363Cf116b6B633faEDF66848ED52895CE703b"
  const SDL = "0xf1Dc500FdE233A4055e25e5BbF516372BC4F6871"

  // deploy Root Gauge Factory
  const childGaugeFacotryDeployment = await deploy("ChildGaugeFactory", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "ChildGaugeFactory",
    args: [ANYCALL_PROXY, SDL, deployer],
  })

  // deploy root gauge implementation
  const childGaugeImplementation = await deploy("ChildGaugeImplementation", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "ChildGauge",
    args: [SDL, childGaugeFacotryDeployment.address],
  })

  // set the deployed implementation
  await execute(
    "RootGaugeFactory",
    { from: deployer, log: true },
    "set_implementation",
    childGaugeImplementation.address,
  )
  // TODO set_voting_escrow
  const veSDL = await get("VotingEscrow")
  await execute(
    "RootGaugeFactory",
    { from: deployer, log: true },
    "set_voting_escrow",
    veSDL.address,
  )

  // TODO set_call_proxy
  await execute(
    "RootGaugeFactory",
    { from: deployer, log: true },
    "set_call_proxy",
    (
      await ethers.getContract("AnycallTranslator")
    ).address,
  )
}
export default func
