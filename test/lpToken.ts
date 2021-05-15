import { Signer } from "ethers"
import { solidity } from "ethereum-waffle"

import { LPToken } from "../build/typechain/LPToken"
import chai from "chai"
import { ethers } from "hardhat"

chai.use(solidity)
const { expect } = chai

describe("LPToken", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let firstToken: LPToken

  it("Reverts when minting 0", async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    // Deploy dummy tokens
    const lpTokenFactory = await ethers.getContractFactory("LPToken")
    firstToken = (await lpTokenFactory.deploy(
      "First Token",
      "FIRST",
      "18",
    )) as LPToken
    await expect(firstToken.mint(await owner.getAddress(), 0)).to.be.reverted
  })
})
