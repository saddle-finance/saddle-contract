import { ethers } from "@nomiclabs/buidler"
import { Signer } from "ethers"
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"

import AllowlistArtifact from "../build/artifacts/Allowlist.json"
import { Allowlist } from "../build/typechain/Allowlist"

chai.use(solidity)
const { expect } = chai

const POOL_ADDRESS_1 = "0x0000000000000000000000000000000000000001"
const POOL_ADDRESS_2 = "0x0000000000000000000000000000000000000002"

describe("Allowlist", () => {
  let signers: Array<Signer>
  let owner: Signer
  let malActor: Signer
  let allowlist: Allowlist
  const allowedAccounts: Array<string> = []
  const muliplierArray: Array<number> = []

  for (let i = 0; i < 450; i++) {
    allowedAccounts[i] = ethers.Wallet.createRandom().address
    muliplierArray[i] = 1000 + i
  }

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    malActor = signers[10]
    allowlist = (await deployContract(owner, AllowlistArtifact)) as Allowlist
  })

  describe("setPoolCap", () => {
    it("Emits PoolCap event", async () => {
      await expect(allowlist.setPoolCap(POOL_ADDRESS_1, String(6e20))).to.emit(
        allowlist,
        "PoolCap",
      )
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

  describe("setPoolAccountLimit & setMultiplier", () => {
    it("Emits PoolAccountLimit event", async () => {
      await expect(
        allowlist.setPoolAccountLimit(POOL_ADDRESS_1, String(6e20)),
      ).to.emit(allowlist, "PoolAccountLimit")
    })

    it("Reverts when non-owner tries to set the pool account limit", async () => {
      await expect(
        allowlist
          .connect(malActor)
          .setPoolAccountLimit(POOL_ADDRESS_1, String(0)),
      ).to.be.reverted
    })

    it("Reverts when array lengths are different", async () => {
      await expect(
        allowlist.setMultipliers(allowedAccounts, muliplierArray.slice(1, 450)),
      ).to.be.reverted
    })

    it("Sets and gets pool account limit", async () => {
      await allowlist.setPoolAccountLimit(POOL_ADDRESS_1, String(4e20))
      await allowlist.setPoolAccountLimit(POOL_ADDRESS_2, String(2e20))
      await allowlist.setMultipliers(allowedAccounts, muliplierArray)

      // POOL 1
      // 4e20 * 1.000
      expect(
        await allowlist.getAllowedAmount(POOL_ADDRESS_1, allowedAccounts[0]),
      ).to.eq(String(4e20))

      // 4e20 * 1.050
      expect(
        await allowlist.getAllowedAmount(POOL_ADDRESS_1, allowedAccounts[50]),
      ).to.eq(String(4.2e20))

      // 4e20 * 1.200
      expect(
        await allowlist.getAllowedAmount(POOL_ADDRESS_1, allowedAccounts[200]),
      ).to.eq(String(4.8e20))

      // POOL 2
      // 2e20 * 1.000
      expect(
        await allowlist.getAllowedAmount(POOL_ADDRESS_2, allowedAccounts[0]),
      ).to.eq(String(2e20))

      // 2e20 * 1.050
      expect(
        await allowlist.getAllowedAmount(POOL_ADDRESS_2, allowedAccounts[50]),
      ).to.eq(String(2.1e20))

      // 2e20 * 1.200
      expect(
        await allowlist.getAllowedAmount(POOL_ADDRESS_2, allowedAccounts[200]),
      ).to.eq(String(2.4e20))
    })
  })
})
