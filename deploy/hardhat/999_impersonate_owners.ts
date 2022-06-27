import {
  asyncForEach,
  impersonateAccount,
  setEtherBalance,
} from "../../test/testUtils"

import { DeployFunction } from "hardhat-deploy/types"
import { GenericERC20 } from "../../build/typechain"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import dotenv from "dotenv"
import { ethers } from "hardhat"
import { isMainnet } from "../../utils/network"
import path from "path"

dotenv.config()

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, log, read, all, get } = deployments
  const { deployer } = await getNamedAccounts()

  // These addresses are for large holders of the given token (used in forked mainnet testing)
  // You can find whales' addresses on etherscan's holders page.
  // Example: https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f#balances
  // Note that some addresses may be blacklisted so if the top address didnt work, try another instead.
  // key = token deployment name, value = array of addresses
  const tokenToAccountsMap: Record<string, string[]> = {
    // USD
    DAI: ["0xa5407eae9ba41422680e2e00537571bcc53efbfd"],
    USDC: ["0xa5407eae9ba41422680e2e00537571bcc53efbfd"],
    USDT: ["0xa5407eae9ba41422680e2e00537571bcc53efbfd"],
    SUSD: ["0xa5407eae9ba41422680e2e00537571bcc53efbfd"],
    // BTC
    WBTC: ["0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714"],
    RENBTC: ["0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714"],
    SBTC: ["0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714"],
    TBTC: ["0xC25099792E9349C7DD09759744ea681C7de2cb66"],
    // ETH
    ALETH: ["0x1d2c4cd9bee9dfe088430b95d274e765151c32db"],
    WETH: ["0xceff51756c56ceffca006cd410b03ffc46dd3a58"],
    SETH: ["0xc5424b857f758e906013f3555dad202e4bdb4567"],
    // D4
    ALUSD: ["0x43b4fdfd4ff969587185cdb6f0bd875c5fc83f8c"],
    FEI: ["0x94b0a3d511b6ecdb17ebf877278ab030acb0a878"],
    FRAX: ["0xd632f22692fac7611d2aa1c0d552930d43caed3b"],
    LUSD: ["0x66017d22b0f8556afdd19fc67041899eb65a21bb"],
    // TBTC
    TBTCv2: ["0xf9e11762d522ea29dd78178c9baf83b7b093aacc"],
  }

  if (
    isMainnet(await getChainId()) &&
    process.env.FORK_NETWORK &&
    process.env.FUND_FORK_NETWORK
  ) {
    // Give the deployer tokens from each token holder for testing
    for (const [tokenName, holders] of Object.entries(tokenToAccountsMap)) {
      const contract = (await ethers.getContract(tokenName)) as GenericERC20

      await asyncForEach(holders, async (holder) => {
        const balance = await contract.balanceOf(holder)
        await setEtherBalance(holder, 1e20)
        await contract
          .connect(await impersonateAccount(holder))
          .transfer(deployer, await contract.balanceOf(holder))
        log(
          `Sent ${ethers.utils.formatUnits(
            balance,
            await contract.decimals(),
          )} ${tokenName} from ${holder} to ${deployer}`,
        )
      })
    }
    // Give the deployer some ether to use for testing
    await setEtherBalance(deployer, 1e20)
  } else {
    log(`skipping ${path.basename(__filename)}`)
  }
}

export default func
