import { ethers, network } from "hardhat"
import { GaugeController, SDL } from "../../build/typechain"
import { getHardhatTestSigners, logNetworkDetails } from "../utils"
import GaugeControllerDeployment from "../../deployments/mainnet/GaugeController.json"
import { impersonateAccount, setEtherBalance } from "../../test/testUtils"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { CHAIN_ID } from "../../utils/network"

/**
 * Forks mainnet and attempts to enable on-chain gauge voting
 */

async function main() {
  // Print network details
  await logNetworkDetails(ethers.provider, network)

  // Impersonate multisig
  const multisig = await impersonateAccount(
    MULTISIG_ADDRESSES[CHAIN_ID.MAINNET],
  )

  // Set eth balance for hardhat test account
  const hardhatTestAccountAddress =
    await getHardhatTestSigners()[0].getAddress()
  await setEtherBalance(
    hardhatTestAccountAddress,
    ethers.constants.WeiPerEther.mul(1000),
  )

  // Send 1000 SDL from multisig to hardhat test account
  const sdl: SDL = await ethers.getContract("SDL")
  await sdl
    .connect(multisig)
    .transfer(hardhatTestAccountAddress, ethers.constants.WeiPerEther.mul(1000))

  // ***********************************************************

  const gaugeController: GaugeController = await ethers.getContractAt(
    "GaugeController",
    GaugeControllerDeployment.address,
  )
  await gaugeController.connect(multisig).set_voting_enabled(true)
  console.log(`Voting enabled: ${await gaugeController.voting_enabled()}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
