import chai from "chai"
import { BigNumber, ContractFactory, ethers, Signer } from "ethers"
import { deployments } from "hardhat"
import { MasterRegistry } from "../../build/typechain/"
import { ZERO_ADDRESS } from "../testUtils"

const { expect } = chai

describe("Master Registry", async () => {
  let signers: Array<Signer>
  let users: string[]
  let owner: Signer
  let ownerAddress: string
  let masterRegistry: MasterRegistry
  let masterRegistryFactory: ContractFactory
  const formatBytes32String = ethers.utils.formatBytes32String

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )
      owner = signers[10]
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
      ).to.be.revertedWith("MR: name cannot be empty")
    })
    it("Reverts when using empty address", async () => {
      await expect(
        masterRegistry.addRegistry(formatBytes32String("TEST"), ZERO_ADDRESS),
      ).to.be.revertedWith("MR: address cannot be empty")
    })
    it("Reverts when using duplicate address", async () => {
      await masterRegistry.addRegistry(
        formatBytes32String("TEST"),
        ownerAddress,
      )
      await expect(
        masterRegistry.addRegistry(formatBytes32String("TEST-2"), ownerAddress),
      ).to.be.revertedWith("MR: duplicate registry address")
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
      ).to.be.revertedWith("MR: no match found for name")
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
      ).to.be.revertedWith("MR: no match found for name")
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
      ).to.be.revertedWith("MR: no match found for name and version")
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
      ).to.be.revertedWith("MR: no match found for address")
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

  describe("grantRole", () => {
    it("Reverts when not called by an account without admin role", async () => {
      // Find the manager role
      const managerRole = await masterRegistry.SADDLE_MANAGER_ROLE()

      // Expect the admin role of the manager role to be zero (0x0000...0000)
      expect(await masterRegistry.getRoleAdmin(managerRole)).to.eq(
        ethers.constants.HashZero,
      )

      // Try granting manager role from an account without admin role
      await expect(
        masterRegistry.grantRole(managerRole, users[1]),
      ).to.be.revertedWith("AccessControl: sender must be an admin to grant")
    })

    it("Successfully grants manager role", async () => {
      // Check the user does not have the manager role
      const managerRole = await masterRegistry.SADDLE_MANAGER_ROLE()
      expect(await masterRegistry.hasRole(managerRole, users[1])).to.be.false

      // Grant the manager role to the user from the owner
      await masterRegistry.connect(owner).grantRole(managerRole, users[1])

      // Check the user now has the manager role
      expect(await masterRegistry.hasRole(managerRole, users[1])).to.be.true
    })

    it("Successfully grants admin role", async () => {
      // Check the user does not have the admin role
      const adminRole = await masterRegistry.DEFAULT_ADMIN_ROLE()
      expect(await masterRegistry.hasRole(adminRole, users[1])).to.be.false

      // Grant the admin role to the user from the owner
      await masterRegistry.connect(owner).grantRole(adminRole, users[1])

      // Check the user now has the admin role
      expect(await masterRegistry.hasRole(adminRole, users[1])).to.be.true

      // Verify the user can grant the manager role
      const managerRole = await masterRegistry.SADDLE_MANAGER_ROLE()
      await masterRegistry.connect(signers[1]).grantRole(managerRole, users[2])
    })
  })

  describe("revokeRole", () => {
    it("Reverts when not called by an account with admin role", async () => {
      // Find the manager role
      const managerRole = await masterRegistry.SADDLE_MANAGER_ROLE()

      // Try revoking manager role from an account without admin role
      await expect(
        masterRegistry.revokeRole(managerRole, users[0]),
      ).to.be.revertedWith("AccessControl: sender must be an admin to revoke")
    })

    it("Successfully revokes manager role", async () => {
      // Check the user has the manager role
      const managerRole = await masterRegistry.SADDLE_MANAGER_ROLE()
      expect(await masterRegistry.hasRole(managerRole, users[0])).to.be.true

      // Revoke the manager role from the user from the owner
      await masterRegistry.connect(owner).revokeRole(managerRole, users[0])

      // Check the user no longer has the manager role
      expect(await masterRegistry.hasRole(managerRole, users[0])).to.be.false
    })
  })

  describe("renounceRole", () => {
    it("Successfully renounces it's own manager role", async () => {
      // Check the user has the manager role
      const managerRole = await masterRegistry.SADDLE_MANAGER_ROLE()
      expect(await masterRegistry.hasRole(managerRole, users[0])).to.be.true

      // Renounce the manager role from the user
      await masterRegistry.renounceRole(managerRole, users[0])

      // Check the user no longer has the manager role
      expect(await masterRegistry.hasRole(managerRole, users[0])).to.be.false
    })

    it("Successfully renounces it's own admin role", async () => {
      // Check the user has the admin role
      const adminRole = await masterRegistry.DEFAULT_ADMIN_ROLE()
      expect(await masterRegistry.hasRole(adminRole, ownerAddress)).to.be.true

      // Renounce the admin role from the user
      await masterRegistry.connect(owner).renounceRole(adminRole, ownerAddress)

      // Check the user no longer has the admin role
      expect(await masterRegistry.hasRole(adminRole, ownerAddress)).to.be.false
    })
  })
})
