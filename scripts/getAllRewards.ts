import chai from "chai"
import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

import { GaugeHelperContract } from "../build/typechain/"

chai.use(solidity)

async function main() {
  const GaugeHelperContract = (await ethers.getContract(
    "GaugeHelperContract",
  )) as GaugeHelperContract

  // get all gauge rewards from helper contract
  const result = (
    await GaugeHelperContract.getGaugeRewards(
      "0xfaAddC93baf78e89DCf37bA67943E1bE8F37Bb8c",
    )
  ).toString()
  console.log("gauge rewards: ", result)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
