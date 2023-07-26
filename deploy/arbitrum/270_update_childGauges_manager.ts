import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ChildGauge } from "../../build/typechain"
import { OPS_MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute } = deployments
  const { deployer } = await getNamedAccounts()

  const allDeploys = await deployments.all()
  for (const contractName in allDeploys) {
    if (
      contractName.startsWith("ChildGauge") &&
      contractName.includes("LPToken")
    ) {
      const childGaugeContract: ChildGauge = (await ethers.getContract(
        contractName,
      )) as ChildGauge
      if (
        (await childGaugeContract.manager()) !=
        OPS_MULTISIG_ADDRESSES[await getChainId()]
      ) {
        await execute(
          contractName,
          { from: deployer, log: true },
          "set_manager",
          OPS_MULTISIG_ADDRESSES[await getChainId()],
        )
      }
    }
  }
}
export default func
