import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, save } = deployments
  const { deployer } = await getNamedAccounts()

  const dummyToken1 = await deploy("DummyERC20", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: false,
    args: ["FreeMintableDummyERC20_1", "Dummy1"],
  })

  // save token deployment
  await save("Dummy1", {
    abi: dummyToken1.abi, // LPToken ABI
    address: dummyToken1.address,
  })

  const dummyToken2 = await deploy("DummyERC20", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: false,
    args: ["FreeMintableDummyERC20_2", "Dummy2"],
  })
  // save token deployment
  await save("Dummy2", {
    abi: dummyToken2.abi, // LPToken ABI
    address: dummyToken2.address,
  })
}
export default func
