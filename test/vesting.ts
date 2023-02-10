import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import {
  Cloner,
  GenericERC20WithGovernance,
  Vesting,
} from "../build/typechain/"
import {
  getCurrentBlockTimestamp,
  setTimestamp,
  ZERO_ADDRESS,
} from "./testUtils"

const { expect } = chai

describe("Vesting", () => {
  let signers: Array<Signer>
  let deployer: Signer
  let deployerAddress: string
  let beneficiary: Signer
  let beneficiaryAddress: string
  let governance: Signer
  let governanceAddress: string
  let malActor: Signer
  let vestingClone: Vesting
  let vesting: Vesting
  let dummyToken: GenericERC20WithGovernance
  let cloner: Cloner

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { deploy } = deployments
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      deployerAddress = await deployer.getAddress()
      beneficiary = signers[1]
      beneficiaryAddress = await beneficiary.getAddress()

      // In this test the governance of the dummy token is same as the deployer.
      governance = signers[0]
      governanceAddress = deployerAddress
      malActor = signers[10]

      await deploy("DummyToken", {
        contract: "GenericERC20WithGovernance",
        args: ["DummyToken", "TOKEN", 18],
        from: deployerAddress,
      })
      dummyToken = await ethers.getContract("DummyToken")
      await dummyToken.mint(
        deployerAddress,
        BigNumber.from(10).pow(18).mul(10000),
      )

      await deploy("Cloner", {
        from: deployerAddress,
        log: true,
        skipIfAlreadyDeployed: true,
      })
      await deploy("Vesting", {
        from: deployerAddress,
        log: true,
        skipIfAlreadyDeployed: true,
      })

      cloner = await ethers.getContract("Cloner")
      vesting = await ethers.getContract("Vesting")

      const cloneAddress = await cloner.callStatic.clone(vesting.address)
      await cloner.clone(vesting.address)

      vestingClone = (await ethers.getContractAt(
        "Vesting",
        cloneAddress,
      )) as Vesting
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("initialize", () => {
    let startTimestamp: number
    beforeEach(async () => {
      startTimestamp = (await getCurrentBlockTimestamp()) - 1000
    })

    it("Fails to initialize the logic contract", async () => {
      await expect(
        vesting.initialize(
          dummyToken.address,
          beneficiaryAddress,
          startTimestamp,
          3600,
          7200,
        ),
      ).to.be.revertedWith("cannot initialize logic contract")
    })

    it("Fails to initialize a clone with empty beneficiary", async () => {
      await expect(
        vestingClone.initialize(
          dummyToken.address,
          ZERO_ADDRESS,
          startTimestamp,
          3600,
          7200,
        ),
      ).to.be.revertedWith("_beneficiary cannot be empty")
    })

    it("Fails to initialize a clone with longer cliff than duration", async () => {
      await expect(
        vestingClone.initialize(
          dummyToken.address,
          beneficiaryAddress,
          startTimestamp,
          7201,
          7200,
        ),
      ).to.be.revertedWith("cliff is greater than duration")
    })

    it("Successfully initializes a clone", async () => {
      await vestingClone.initialize(
        dummyToken.address,
        beneficiaryAddress,
        startTimestamp,
        3600,
        7200,
      )
      expect(await vestingClone.beneficiary()).to.eq(beneficiaryAddress)
      expect(await vestingClone.governance()).to.eq(deployerAddress)
    })
  })

  describe("vestedAmount", () => {
    const totalVestedAmount = BigNumber.from(10).pow(18).mul(10000)

    beforeEach(async () => {
      const startTimestamp = (await getCurrentBlockTimestamp()) - 1000
      await vestingClone.initialize(
        dummyToken.address,
        beneficiaryAddress,
        startTimestamp,
        3600,
        7200,
      )
    })

    describe("contract is initialized but NOT filled with tokens", () => {
      it("Successfully returns 0 when contract is empty", async () => {
        // vestedAmount should return 0 since the contract is empty
        expect(await vestingClone.vestedAmount()).to.eq(0)

        // Let some time pass by so the vesting calculation starts
        const startTimestamp = await vestingClone.startTimestamp()
        await setTimestamp(startTimestamp.add(3600).toNumber())

        // The contract is still not filled with tokens. Below call should be reverted.
        await expect(
          vestingClone.connect(beneficiary).release(),
        ).to.be.revertedWith("No tokens to release")
      })
    })

    describe("contract is initialized and filled with some tokens", () => {
      // Fill the contact with some tokens
      beforeEach(async () => {
        await dummyToken.transfer(vestingClone.address, totalVestedAmount)
      })

      it("Successfully calculates the vested amounts", async () => {
        const startTimestamp = await vestingClone.startTimestamp()

        // Before Cliff is reached
        expect(await vestingClone.vestedAmount()).to.eq(0)
        await setTimestamp(startTimestamp.add(1800).toNumber())
        expect(await vestingClone.vestedAmount()).to.eq(0)

        // After Cliff is reached
        await setTimestamp(startTimestamp.add(3600).toNumber())
        expect(await vestingClone.vestedAmount()).to.eq(
          totalVestedAmount.div(2),
        )
        await setTimestamp(startTimestamp.add(5400).toNumber())
        expect(await vestingClone.vestedAmount()).to.eq(
          totalVestedAmount.mul(3).div(4),
        )

        // After Duration is over
        await setTimestamp(startTimestamp.add(7200).toNumber())
        expect(await vestingClone.vestedAmount()).to.eq(totalVestedAmount)
      })

      it("Successfully returns 0 when there are no more tokens left in the contract", async () => {
        const startTimestamp = await vestingClone.startTimestamp()

        // After Duration is over
        await setTimestamp(startTimestamp.add(7200).toNumber())
        expect(await vestingClone.vestedAmount()).to.eq(totalVestedAmount)

        // Claims everything
        await vestingClone.connect(beneficiary).release()

        // vestedAmount should return 0 since the contract is empty
        expect(await vestingClone.vestedAmount()).to.eq(0)
      })
    })
  })

  describe("release", () => {
    const totalVestedAmount = BigNumber.from(10).pow(18).mul(10000)

    beforeEach(async () => {
      const startTimestamp = (await getCurrentBlockTimestamp()) - 1000
      await vestingClone.initialize(
        dummyToken.address,
        beneficiaryAddress,
        startTimestamp,
        3600,
        7200,
      )
      await dummyToken.transfer(vestingClone.address, totalVestedAmount)
    })

    it("Fails when there are no tokens to claim", async () => {
      await expect(
        vestingClone.connect(beneficiary).release(),
      ).to.be.revertedWith("No tokens to release")
    })

    it("Successfully releases the vested amounts", async () => {
      const startTimestamp = await vestingClone.startTimestamp()

      // After Cliff is reached
      await setTimestamp(startTimestamp.add(3600).toNumber())
      expect(await vestingClone.vestedAmount()).to.eq(totalVestedAmount.div(2))
      await vestingClone.connect(beneficiary).release()
      expect(await dummyToken.balanceOf(beneficiaryAddress))
        .gte(totalVestedAmount.div(2))
        .and.lte("5001388888888888888888")

      await setTimestamp(startTimestamp.add(5400).toNumber())
      await vestingClone.connect(beneficiary).release()
      expect(await dummyToken.balanceOf(beneficiaryAddress))
        .gte(totalVestedAmount.mul(3).div(4))
        .and.lte("7501388888888888888888")

      // After Duration is over
      await setTimestamp(startTimestamp.add(7200).toNumber())
      await vestingClone.connect(beneficiary).release()
      expect(await dummyToken.balanceOf(beneficiaryAddress)).eq(
        totalVestedAmount,
      )
    })
  })

  describe("changeBeneficiary", () => {
    const totalVestedAmount = BigNumber.from(10).pow(18).mul(10000)

    beforeEach(async () => {
      const startTimestamp = (await getCurrentBlockTimestamp()) - 1000
      await vestingClone.initialize(
        dummyToken.address,
        beneficiaryAddress,
        startTimestamp,
        3600,
        7200,
      )
      await dummyToken.transfer(vestingClone.address, totalVestedAmount)
    })

    it("Fails when called by other than the governance", async () => {
      await expect(
        vestingClone
          .connect(malActor)
          .changeBeneficiary(await malActor.getAddress()),
      ).to.be.revertedWith("only governance can perform this action")
    })

    it("Successfully changes beneficiary", async () => {
      await vestingClone.connect(governance).changeBeneficiary(deployerAddress)
      expect(await vestingClone.beneficiary()).to.be.eq(deployerAddress)
    })
  })
})
