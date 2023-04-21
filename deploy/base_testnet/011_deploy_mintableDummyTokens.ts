import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, save } = deployments
  const { deployer } = await getNamedAccounts()

  const dummyToken1 = await deploy("Dummy1", {
    contract: "DummyERC20",
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: ["FreeMintableDummyERC20_1", "Dummy1"],
  })

  // save token deployment
  await save("Dummy1", {
    abi: dummyToken1.abi,
    address: dummyToken1.address,
  })

  const dummyToken2 = await deploy("Dummy2", {
    contract: "DummyERC20",
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: ["FreeMintableDummyERC20_2", "Dummy2"],
  })
  // save token deployment
  await save("Dummy2", {
    abi: dummyToken2.abi,
    address: dummyToken2.address,
  })
}
export default func
