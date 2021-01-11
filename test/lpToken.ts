import { Signer, Wallet } from "ethers"
import { deployContract, solidity } from "ethereum-waffle"

import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import { LpToken } from "../build/typechain/LpToken"
import chai from "chai"
import { ethers } from "hardhat"

chai.use(solidity)
const { expect } = chai

describe("LPToken", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let firstToken: LpToken

  it("Reverts when minting 0", async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    // Deploy dummy tokens
    firstToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "First Token",
      "FIRST",
      "18",
    ])) as LpToken
    await expect(firstToken.mint(await owner.getAddress(), 0)).to.be.reverted
  })
})
