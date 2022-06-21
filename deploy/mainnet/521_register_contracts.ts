import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MasterRegistry } from "../../build/typechain"

// Register unique contracts related to VotingEscrow
// GaugeController, VotingEscrow, Minter, FeeDistributor
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, read } = deployments
  const { deployer } = await getNamedAccounts()

  const MASTER_REGISTRY_NAME = "MasterRegistry"

  // List of contract names to register in MasterRegistry
  const GAUGE_HELPER_CONTRACT_NAME = "GaugeHelperContract"
  const GAUGE_CONTROLLER_NAME = "GaugeController"
  const VOTING_ESCROW_NAME = "VotingEscrow"
  const MINTER_NAME = "Minter"
  const FEE_DISTRIBUTOR_NAME = "FeeDistributor"

  const contractNamesToRegister = [
    GAUGE_HELPER_CONTRACT_NAME,
    GAUGE_CONTROLLER_NAME,
    VOTING_ESCROW_NAME,
    MINTER_NAME,
    FEE_DISTRIBUTOR_NAME,
  ]

  // Get the MasterRegistry contract
  const masterRegistry = (await ethers.getContract(
    MASTER_REGISTRY_NAME,
  )) as MasterRegistry

  // Create a batch call to register the contracts
  const batchCall = await Promise.all(
    contractNamesToRegister.map(async (contractName) => {
      return await masterRegistry.populateTransaction.addRegistry(
        ethers.utils.formatBytes32String(contractName),
        (
          await get(contractName)
        ).address,
      )
    }),
  )

  const batchCallData = batchCall
    .map((x) => x.data)
    .filter((x): x is string => !!x)

  // Check if the contracts are already registered
  // If not, register them
  try {
    await Promise.all(
      contractNamesToRegister.map(async (contractName) => {
        await read(
          MASTER_REGISTRY_NAME,
          "resolveNameToLatestAddress",
          ethers.utils.formatBytes32String(contractName),
        )
      }),
    )
  } catch {
    await execute(
      MASTER_REGISTRY_NAME,
      { from: deployer, log: true, gasLimit: 3_000_000 },
      "batch",
      batchCallData,
      false, // If one of the txs revert, ignore
    )
  }
}
export default func
