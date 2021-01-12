import { ethers } from "hardhat"
import { Signer } from "ethers"
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"

import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import { Allowlist } from "../build/typechain/Allowlist"

import merkleTreeData from "./exampleMerkleTree.json"
import { asyncForEach, ZERO_ADDRESS } from "./testUtils"

chai.use(solidity)
const { expect } = chai

const POOL_ADDRESS_1 = "0x0000000000000000000000000000000000000001"
const POOL_ADDRESS_2 = "0x0000000000000000000000000000000000000002"

describe("Allowlist", () => {
  let signers: Array<Signer>
  let owner: Signer
  let malActor: Signer
  let allowlist: Allowlist

  const ALLOWED_ACCOUNTS: Record<string, any> = merkleTreeData.allowedAccounts

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    malActor = signers[10]
    allowlist = (await deployContract(owner, AllowlistArtifact, [
      merkleTreeData.merkleRoot,
    ])) as Allowlist
  })

  describe("setPoolCap, getPoolCap", () => {
    it("Emits PoolCap event", async () => {
      await expect(allowlist.setPoolCap(POOL_ADDRESS_1, String(6e20))).to.emit(
        allowlist,
        "PoolCap",
      )
    })

    it("Reverts when the pool address is 0x0", async () => {
      await expect(allowlist.setPoolCap(ZERO_ADDRESS, String(6e20))).to.be
        .reverted
    })

    it("Reverts when non-owner tries to set the pool cap", async () => {
      await expect(
        allowlist.connect(malActor).setPoolCap(POOL_ADDRESS_1, String(0)),
      ).to.be.reverted
    })

    it("Sets and gets pool cap", async () => {
      await allowlist.setPoolCap(POOL_ADDRESS_1, String(4e20))
      expect(await allowlist.getPoolCap(POOL_ADDRESS_1)).to.eq(String(4e20))
      expect(await allowlist.getPoolCap(POOL_ADDRESS_2)).to.eq(String(0))

      await allowlist.setPoolCap(POOL_ADDRESS_2, String(5e20))
      expect(await allowlist.getPoolCap(POOL_ADDRESS_1)).to.eq(String(4e20))
      expect(await allowlist.getPoolCap(POOL_ADDRESS_2)).to.eq(String(5e20))
    })
  })

  describe("setPoolAccountLimit and getPoolAccountLimit", () => {
    it("Emits PoolAccountLimit event", async () => {
      await expect(
        allowlist.setPoolAccountLimit(POOL_ADDRESS_1, String(6e20)),
      ).to.emit(allowlist, "PoolAccountLimit")
    })

    it("Reverts when the pool address is 0x0", async () => {
      await expect(allowlist.setPoolAccountLimit(ZERO_ADDRESS, String(6e20))).to
        .be.reverted
    })

    it("Reverts when non-owner tries to set the pool account limit", async () => {
      await expect(
        allowlist
          .connect(malActor)
          .setPoolAccountLimit(POOL_ADDRESS_1, String(0)),
      ).to.be.reverted
    })

    it("Sets and gets pool account limit", async () => {
      await allowlist.setPoolAccountLimit(POOL_ADDRESS_1, String(4e20))
      await allowlist.setPoolAccountLimit(POOL_ADDRESS_2, String(2e20))

      // POOL 1
      // 4e20
      expect(await allowlist.getPoolAccountLimit(POOL_ADDRESS_1)).to.eq(
        String(4e20),
      )

      // POOL 2
      expect(await allowlist.getPoolAccountLimit(POOL_ADDRESS_2)).to.eq(
        String(2e20),
      )
    })
  })

  describe("verifyAddress", () => {
    it("Returns true when proof and address are correct", async () => {
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        expect(
          await allowlist.verifyAddress(
            account,
            ALLOWED_ACCOUNTS[account].proof,
          ),
        ).to.be.eq(true)
      })
    })

    it("Returns false when proof is wrong", async () => {
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        expect(await allowlist.verifyAddress(account, [])).to.be.eq(false)
      })
    })

    it("Returns false when address is wrong", async () => {
      const malActorAddress = await malActor.getAddress()
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        expect(
          await allowlist.verifyAddress(
            malActorAddress,
            ALLOWED_ACCOUNTS[account].proof,
          ),
        ).to.be.eq(false)
      })
    })
  })

  describe("updateMerkleRoot", () => {
    const newMerkleRoot =
      "0xfbc2f54de92972c0f2c6bbd5003031662aa9b8240f4375dc03d3157d8651ec45"

    it("Emits NewMerkleRoot event", async () => {
      await expect(allowlist.updateMerkleRoot(newMerkleRoot)).to.emit(
        allowlist,
        "NewMerkleRoot",
      )
    })

    it("Updates merkleRoot successfully", async () => {
      await allowlist.updateMerkleRoot(newMerkleRoot)
      expect(await allowlist.merkleRoot()).to.eq(newMerkleRoot)
    })

    it("Reverts when called by non-owner", async () => {
      await expect(
        allowlist.connect(signers[10]).updateMerkleRoot(newMerkleRoot),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })
})
