import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

import chai from "chai"
import { impersonateAccount, setEtherBalance } from "../test/testUtils"
import { LPToken } from "../build/typechain/"

chai.use(solidity)

async function main() {
  const { deployer } = await ethers.getNamedSigners()

  const tbtcMetaPoolLpToken = (await ethers.getContractAt(
    "LPToken",
    "0x3f2f811605bC6D701c3Ad6E501be13461c560320",
  )) as LPToken

  // This info can be found on etherscan's holders page
  // https://etherscan.io/token/0x3f2f811605bC6D701c3Ad6E501be13461c560320#balances
  const whaleAccount = "0x691ef79e40d909c715be5e9e93738b3ff7d58534"
  const whaleSigner = await impersonateAccount(whaleAccount)

  // Make sure the account has some eth so our impersonated transactions can go through
  await setEtherBalance(whaleAccount, 1e20)

  const whaleBalance = await tbtcMetaPoolLpToken.balanceOf(whaleAccount)

  await tbtcMetaPoolLpToken
    .connect(whaleSigner)
    .transfer(await deployer.getAddress(), whaleBalance)

  console.log(
    `Transferred ${whaleBalance} TBTCMetaPoolUpdatedLPToken from ${whaleAccount} to deployer account`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
