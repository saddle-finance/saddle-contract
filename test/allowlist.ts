import chai from "chai"
import { Signer } from "ethers"
import { formatBytes32String } from "ethers/lib/utils"
import { deployments } from "hardhat"
import { Allowlist } from "../build/typechain/"
import {
  asyncForEach,
  getTestMerkleAllowedAccounts,
  getTestMerkleRoot,
  ZERO_ADDRESS,
} from "./testUtils"

const { expect } = chai

const POOL_ADDRESS_1 = "0x0000000000000000000000000000000000000001"
const POOL_ADDRESS_2 = "0x0000000000000000000000000000000000000002"
const ALLOWED_ACCOUNTS = getTestMerkleAllowedAccounts()

describe("Allowlist", () => {
  let signers: Array<Signer>
  let malActor: Signer
  let allowlist: Allowlist

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      malActor = signers[10]

      const cf = await ethers.getContractFactory("Allowlist")
      allowlist = (await cf.deploy(getTestMerkleRoot())) as Allowlist
    },
  )

  beforeEach(async () => {
    await setupTest()
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

  describe("verifyAddress() & isAccountVerified()", () => {
    // For verifyAddress(), as the function modifies the state, we need to call it with callStatic
    // chain such that the call is computed but not executed.

    it("Returns true when proof and address are correct", async () => {
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        expect(
          await allowlist.callStatic.verifyAddress(
            account,
            ALLOWED_ACCOUNTS[account].proof,
          ),
        ).to.be.eq(true)
        await allowlist.verifyAddress(account, ALLOWED_ACCOUNTS[account].proof)

        expect(await allowlist.isAccountVerified(account)).to.be.eq(true)
      })
    })

    it("Returns true when merkleProof is empty but the account has been verified", async () => {
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        // Verify with the correct proof
        expect(
          await allowlist.callStatic.verifyAddress(
            account,
            ALLOWED_ACCOUNTS[account].proof,
          ),
        ).to.be.eq(true)
        await allowlist.verifyAddress(account, ALLOWED_ACCOUNTS[account].proof)
        expect(await allowlist.isAccountVerified(account)).to.be.eq(true)

        // Try calling `verifyAddress()` with an empty proof
        expect(await allowlist.callStatic.verifyAddress(account, [])).to.be.eq(
          true,
        )
        await allowlist.verifyAddress(account, [])

        expect(await allowlist.isAccountVerified(account)).to.be.eq(true)
      })
    })

    it("Returns true when merkleProof is wrong but the account has been verified", async () => {
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        // Verify with the correct proof
        expect(
          await allowlist.callStatic.verifyAddress(
            account,
            ALLOWED_ACCOUNTS[account].proof,
          ),
        ).to.be.eq(true)
        await allowlist.verifyAddress(account, ALLOWED_ACCOUNTS[account].proof)
        expect(await allowlist.isAccountVerified(account)).to.be.eq(true)

        // Try calling `verifyAddress()` with an incorrect proof
        // Since the account has already been verified, the function still returns true.
        expect(
          await allowlist.callStatic.verifyAddress(account, [
            formatBytes32String("Incorrect Proof"),
          ]),
        ).to.be.eq(true)
        await allowlist.verifyAddress(account, [
          formatBytes32String("Incorrect Proof"),
        ])

        // Verification status is true.
        expect(await allowlist.isAccountVerified(account)).to.be.eq(true)
      })
    })

    it("Returns false when merkleProof is empty and the account has NOT been verified", async () => {
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        expect(await allowlist.callStatic.verifyAddress(account, [])).to.be.eq(
          false,
        )
        await allowlist.verifyAddress(account, [])
        expect(await allowlist.isAccountVerified(account)).to.be.eq(false)
      })
    })

    it("Returns false when address is wrong", async () => {
      const malActorAddress = await malActor.getAddress()
      await asyncForEach(Object.keys(ALLOWED_ACCOUNTS), async (account) => {
        expect(
          await allowlist.callStatic.verifyAddress(
            malActorAddress,
            ALLOWED_ACCOUNTS[account].proof,
          ),
        ).to.be.eq(false)

        await allowlist.verifyAddress(
          malActorAddress,
          ALLOWED_ACCOUNTS[account].proof,
        )

        expect(await allowlist.isAccountVerified(malActorAddress)).to.be.eq(
          false,
        )
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
