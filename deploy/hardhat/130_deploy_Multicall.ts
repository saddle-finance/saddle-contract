import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { impersonateAccount } from "../../test/testUtils"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, save } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

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

  if ((await getChainId()) == CHAIN_ID.HARDHAT) {
    const contractOwnerAddress = "0x05f32b3cc3888453ff71b01135b34ff8e41263f2"
    const impersonatedOwner = await impersonateAccount(contractOwnerAddress)
    await hre.network.provider.send("hardhat_setBalance", [
      await impersonatedOwner.getAddress(),
      `0x${(1e18).toString(16)}`,
    ])

    const multicall3Factory = await ethers.getContractFactory(
      "Multicall3",
      impersonatedOwner,
    )

    const multicall3 = await multicall3Factory.deploy()
    await multicall3.deployed()

    await save("Multicall3", {
      abi: multicall3Factory.interface.format() as string[],
      address: multicall3.address,
    })
  }
}

export default func
func.tags = ["Multicall"]
