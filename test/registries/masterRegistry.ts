import { BigNumber, ContractFactory, ethers, Signer } from "ethers"
import { solidity } from "ethereum-waffle"

import chai from "chai"
import { deployments } from "hardhat"
import { ZERO_ADDRESS } from "../testUtils"
import { MasterRegistry } from "../../build/typechain/MasterRegistry"

chai.use(solidity)
const { expect } = chai

describe("Master Registry", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let ownerAddress: string
  let masterRegistry: MasterRegistry
  let masterRegistryFactory: ContractFactory
  const formatBytes32String = ethers.utils.formatBytes32String

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      ownerAddress = await owner.getAddress()
      masterRegistryFactory = await ethers.getContractFactory("MasterRegistry")
      masterRegistry = (await masterRegistryFactory.deploy(
        ownerAddress,
      )) as MasterRegistry
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("addRegistry", () => {
    it("Reverts when using empty string", async () => {
      await expect(
        masterRegistry.addRegistry(formatBytes32String(""), ownerAddress),
      ).to.be.revertedWith("name cannot be empty")
    })
    it("Reverts when using empty address", async () => {
      await expect(
        masterRegistry.addRegistry(formatBytes32String("TEST"), ZERO_ADDRESS),
      ).to.be.revertedWith("address cannot be empty")
    })
    it("Reverts when using duplicate address", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        ownerAddress,
      )
      await expect(
        masterRegistry.addRegistry(formatBytes32String("TEST-2"), ownerAddress),
      ).to.be.revertedWith("duplicate registry address")
    })

    it("Successfully adds a new registry with a new name", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        ownerAddress,
      )
      expect(
        await masterRegistry.resolveNameToLatestAddress(
          formatBytes32String("TEST"),
        ),
      ).to.eq(ownerAddress)
    })

    it("Successfully adds a new registry with a same name", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[0].getAddress(),
      )
      expect(
        await masterRegistry.resolveNameToLatestAddress(
          formatBytes32String("TEST"),
        ),
      ).to.eq(await signers[0].getAddress())
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[1].getAddress(),
      )
      expect(
        await masterRegistry.resolveNameToLatestAddress(
          formatBytes32String("TEST"),
        ),
      ).to.eq(await signers[1].getAddress())
    })
  })

  describe("resolveNameToLatestAddress", () => {
    it("Reverts when no match is found", async () => {
      await expect(
        masterRegistry.resolveNameToLatestAddress(
          formatBytes32String("RANDOM_NAME"),
        ),
      ).to.be.revertedWith("no match found for name")
    })
    it("Successfully resolves name to latest address", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[0].getAddress(),
      )
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[1].getAddress(),
      )
      expect(
        await masterRegistry.resolveNameToLatestAddress(
          formatBytes32String("TEST"),
        ),
      ).to.eq(await signers[1].getAddress())
    })
  })

  describe("resolveNameToAllAddresses", () => {
    it("Reverts when no match is found", async () => {
      await expect(
        masterRegistry.resolveNameToAllAddresses(
          formatBytes32String("RANDOM_NAME"),
        ),
      ).to.be.revertedWith("no match found for name")
    })
    it("Successfully resolves name to all addresses", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[0].getAddress(),
      )
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[1].getAddress(),
      )
      expect(
        await masterRegistry.resolveNameToAllAddresses(
          formatBytes32String("TEST"),
        ),
      ).to.eql([await signers[0].getAddress(), await signers[1].getAddress()])
    })
  })

  describe("resolveNameAndVersionToAddress", () => {
    it("Reverts when no match is found", async () => {
      await expect(
        masterRegistry.resolveNameAndVersionToAddress(
          formatBytes32String("RANDOM_NAME"),
          0,
        ),
      ).to.be.revertedWith("no match found for name and version")
    })
    it("Successfully resolves name and verion to an address", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[0].getAddress(),
      )
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[1].getAddress(),
      )
      expect(
        await masterRegistry.resolveNameAndVersionToAddress(
          formatBytes32String("TEST"),
          0,
        ),
      ).to.eq(await signers[0].getAddress())
      expect(
        await masterRegistry.resolveNameAndVersionToAddress(
          formatBytes32String("TEST"),
          1,
        ),
      ).to.eq(await signers[1].getAddress())
    })
  })

  describe("resolveAddressToRegistryData", () => {
    it("Reverts when no match is found", async () => {
      await expect(
        masterRegistry.resolveAddressToRegistryData(ownerAddress),
      ).to.be.revertedWith("no match found for address")
    })
    it("Successfully resolves addresses to registry data", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[0].getAddress(),
      )
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        await signers[1].getAddress(),
      )
      await masterRegistry.addRegistry(
        formatBytes32String("TEST2"),
        await signers[2].getAddress(),
      )
      expect(
        await masterRegistry.resolveAddressToRegistryData(
          await signers[0].getAddress(),
        ),
      ).to.eql([formatBytes32String("TEST"), BigNumber.from(0), false])
      expect(
        await masterRegistry.resolveAddressToRegistryData(
          await signers[1].getAddress(),
        ),
      ).to.eql([formatBytes32String("TEST"), BigNumber.from(1), true])
      expect(
        await masterRegistry.resolveAddressToRegistryData(
          await signers[2].getAddress(),
        ),
      ).to.eql([formatBytes32String("TEST2"), BigNumber.from(0), true])
    })
  })
})
