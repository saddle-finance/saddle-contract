import { waffle, ethers } from "@nomiclabs/buidler"
import { Wallet, Signer } from "ethers";
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"
import { utils } from "ethers"

import OwnerPausableArtifact from "../build/artifacts/OwnerPausable.json"
import { OwnerPausable } from "../build/typechain/OwnerPausable"

chai.use(solidity)
const { expect } = chai

describe("OwnerPausable", () => {
  const provider = waffle.provider
  let signers: Array<Signer>

  let ownerPausable: OwnerPausable

  beforeEach(async () => {
    signers = await ethers.getSigners()
    ownerPausable = (await deployContract(
      <Wallet>signers[0],
      OwnerPausableArtifact,
    )) as OwnerPausable
  })

  it("Emits an event on pausing", async () => {
    await expect(
      ownerPausable.pause(),
    ).to.emit(ownerPausable, 'Paused')
  })

  it("Reverts when pausing if already paused", async () => {
    await ownerPausable.pause()
    await expect(
      ownerPausable.pause(),
    ).to.be.reverted
  })

  it("Reverts when a non-owner tries to pause", async () => {
    await expect(
      ownerPausable.connect(<Wallet>signers[1]).pause(),
    ).to.be.reverted
  })

  it("Emits an event on unpausing", async () => {
    await ownerPausable.pause()
    await expect(
      ownerPausable.unpause(),
    ).to.emit(ownerPausable, 'Unpaused')
  })

  it("Reverts when unpausing if already unpaused", async () => {
    await expect(
      ownerPausable.unpause(),
    ).to.be.reverted
  })

  it("Reverts when a non-owner tries to unpause", async () => {
    await expect(
      ownerPausable.connect(<Wallet>signers[1]).unpause(),
    ).to.be.reverted
  })
})
