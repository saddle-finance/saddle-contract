import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { CHAIN_ID } from "../utils/network"
import path from "path"
import { asyncForEach, impersonateAccount } from "../test/testUtils"
import { ethers } from "hardhat"

import { GenericERC20 } from "../build/typechain/GenericERC20"

import dotenv from "dotenv"
dotenv.config()

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, log, read, all, get } = deployments
  const { deployer } = await getNamedAccounts()

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
  }

  if (
    (await getChainId()) == CHAIN_ID.MAINNET &&
    process.env.FORK_MAINNET &&
    process.env.FUND_FORK_MAINNET
  ) {
    for (const [tokenName, holders] of Object.entries(tokenToAccountsMap)) {
      const contract = (await ethers.getContractAt(
        "GenericERC20",
        (
          await get(tokenName)
        ).address,
      )) as GenericERC20

      await asyncForEach(holders, async (holder) => {
        const balance = await contract.balanceOf(holder)
        await contract
          .connect(await impersonateAccount(holder))
          .transfer(deployer, await contract.balanceOf(holder), { gasPrice: 0 })
        log(
          `Sent ${ethers.utils.formatUnits(
            balance,
            await contract.decimals(),
          )} ${tokenName} from ${holder} to ${deployer}`,
        )
      })
    }
  } else {
    log(`skipping ${path.basename(__filename)}`)
  }
}

export default func
