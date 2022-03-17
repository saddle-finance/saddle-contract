import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { impersonateAccount } from "../../test/testUtils"
import { ethers, hardhatArguments } from "hardhat"



const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, save } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("Multicall", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  await deploy("Multicall2", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  const contractOwnerAddress = '0x05f32b3cc3888453ff71b01135b34ff8e41263f2'
  const impersonatedOwner = await impersonateAccount(contractOwnerAddress)
  await hre.network.provider.send("hardhat_setBalance", [
    await impersonatedOwner.getAddress(),
    `0x${(1e18).toString(16)}`,
  ])
  const Multicall3 = await ethers.getContractFactory("Multicall3", impersonatedOwner);
  const multicall3 = await Multicall3.deploy();
  await multicall3.deployed();
  await save("Multicall3", {
    abi: multicall3.abi,
    address: multicall3.address,
  })
  console.log("multicall3 deployed to:", multicall3.address);

}
export default func
func.tags = ["Multicall"]
