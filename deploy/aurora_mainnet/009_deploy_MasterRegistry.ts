import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MasterRegistry } from "../../build/typechain"
import {
  MULTISIG_ADDRESSES,
  OPS_MULTISIG_ADDRESSES,
} from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read } = deployments
  const { deployer } = await getNamedAccounts()

  const masterRegistry = await getOrNull("MasterRegistry")

  if (masterRegistry == null) {
    await deploy("MasterRegistry", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [deployer],
    })

    const contract = (await ethers.getContract(
      "MasterRegistry",
    )) as MasterRegistry

    const batchCall = [
      // Add the Pool Registry to the Master Registry
      await contract.populateTransaction.addRegistry(
        ethers.utils.formatBytes32String("PoolRegistry"),
        (
          await get("PoolRegistry")
        ).address,
      ),
      // Set the multisig as the FeeCollector for permissionless deployments
      await contract.populateTransaction.addRegistry(
        ethers.utils.formatBytes32String("FeeCollector"),
        MULTISIG_ADDRESSES[await getChainId()],
      ),
      // Grant the ops multisig the saddle manager role, revoke deployer's role
      await contract.populateTransaction.grantRole(
        await contract.SADDLE_MANAGER_ROLE(),
        OPS_MULTISIG_ADDRESSES[await getChainId()],
      ),
      await contract.populateTransaction.revokeRole(
        await contract.SADDLE_MANAGER_ROLE(),
        deployer,
      ),
      // After roles are set, give admin access to the multisig
      await contract.populateTransaction.grantRole(
        await contract.DEFAULT_ADMIN_ROLE(),
        MULTISIG_ADDRESSES[await getChainId()],
      ),
      await contract.populateTransaction.revokeRole(
        await contract.DEFAULT_ADMIN_ROLE(),
        deployer,
      ),
    ]

    const batchCallData = batchCall
      .map((x) => x.data)
      .filter((x): x is string => !!x)

    await execute(
      "MasterRegistry",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      true,
    )
  }
}
export default func
func.tags = ["MasterRegistry"]
