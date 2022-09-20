import { setEtherBalance } from "../../test/testUtils"

import dotenv from "dotenv"
import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { getHardhatTestSigners } from "../../scripts/utils"
import { isMainnet } from "../../utils/network"
import { stealFundsFromWhales } from "../deployUtils"

dotenv.config()

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, log, read, all, get } = deployments
  const { deployer } = await getNamedAccounts()
  const hardhatTestAccount = getHardhatTestSigners()[0]

  // These addresses are for large holders of the given token (used in forked mainnet testing)
  // You can find whales' addresses on etherscan's holders page.
  // Example: https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f#balances
  // Note that some addresses may be blacklisted so if the top address didnt work, try another instead.
  // key = token deployment name, value = array of addresses
  const tokenToAccountsMap: Record<string, string[]> = {
    // USD
    USDC: ["0x489ee077994B6658eAfA855C308275EAd8097C4A"],
    FRAX: ["0x489ee077994b6658eafa855c308275ead8097c4a"],
    USDT: ["0x489ee077994b6658eafa855c308275ead8097c4a"],
  }

  // Addresses to receive funds from the whales
  const receivers = [deployer, await hardhatTestAccount.getAddress()]

  if (
    isMainnet(await getChainId()) &&
    process.env.HARDHAT_DEPLOY_FORK &&
    process.env.FUND_FORK_NETWORK
  ) {
    // Steal funds from whales to the deployer account and hardhat test account
    await stealFundsFromWhales(hre, tokenToAccountsMap, receivers)
    // Give some ether to all receivers
    await Promise.all(
      receivers.map(async (receiver) =>
        setEtherBalance(receiver, ethers.constants.WeiPerEther.mul(1000)),
      ),
    )
  } else {
    log(`skipping ${path.basename(__filename)}`)
  }
}

export default func
