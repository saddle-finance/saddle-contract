import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import { DeployResult } from "hardhat-deploy/dist/types"
import { SDL, Vesting } from "../build/typechain/"
import {
  BIG_NUMBER_1E18,
  BIG_NUMBER_ZERO,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
  ZERO_ADDRESS,
} from "./testUtils"

const { expect } = chai

describe("Token", () => {
  let signers: Array<Signer>
  let deployer: Signer
  let deployerAddress: string
  let governance: Signer
  let governanceAddress: string
  let vesting: Vesting
  let saddleToken: SDL
  let startTimestamp: number
  const PAUSE_PERIOD = 1800
  const vestingContracts: Vesting[] = []

  interface Recipient {
    to: string
    amount: BigNumber
    startTimestamp: BigNumber
    cliffPeriod: BigNumber
    durationPeriod: BigNumber
  }

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { deploy, deterministic } = deployments
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      deployerAddress = await deployer.getAddress()
      governance = signers[1]
      governanceAddress = await governance.getAddress()

      // Signers [10, 11, 12] are vested, [13, 14] are not vested
      const vestingStartTimestamp = BigNumber.from(
        await getCurrentBlockTimestamp(),
      ).sub(1000)
      const vestingRecipients: Recipient[] = [
        {
          to: await signers[10].getAddress(),
          amount: BIG_NUMBER_1E18.mul(2e8),
          startTimestamp: vestingStartTimestamp,
          cliffPeriod: BigNumber.from(3600),
          durationPeriod: BigNumber.from(7200),
        },
        {
          to: await signers[11].getAddress(),
          amount: BIG_NUMBER_1E18.mul(2e8),
          startTimestamp: vestingStartTimestamp,
          cliffPeriod: BigNumber.from(3600),
          durationPeriod: BigNumber.from(7200),
        },
        {
          to: await signers[12].getAddress(),
          amount: BIG_NUMBER_1E18.mul(2e8),
          startTimestamp: vestingStartTimestamp,
          cliffPeriod: BigNumber.from(3600),
          durationPeriod: BigNumber.from(7200),
        },
      ]

      const nonVestingRecipients = [
        {
          to: await signers[13].getAddress(),
          amount: BIG_NUMBER_1E18.mul(2e8),
        },
        {
          to: await signers[14].getAddress(),
          amount: BIG_NUMBER_1E18.mul(2e8),
        },
      ]

      await deploy("Vesting", {
        from: deployerAddress,
        log: true,
        skipIfAlreadyDeployed: true,
      })

      vesting = await ethers.getContract("Vesting")

      // Calculate deterministic deployment address
      const determinedDeployment = await deterministic("SDL", {
        from: deployerAddress,
        args: [governanceAddress, PAUSE_PERIOD, vesting.address],
        log: true,
      })

      // Send couple ether to the predicted address (for testing eth rescue)
      const tx = {
        to: determinedDeployment.address,
        // Convert currency unit from ether to wei
        value: ethers.utils.parseEther("5"),
      }
      await deployer.sendTransaction(tx)

      // Deploy the token contract
      const deployResult: DeployResult = await determinedDeployment.deploy()
      startTimestamp = await getCurrentBlockTimestamp()

      console.log(`Gas used to deploy token: ${deployResult.receipt?.gasUsed}`)

      // Find the saddle token deployment
      saddleToken = await ethers.getContract("SDL")

      // Approve the token usage for deploying vesting contracts
      await saddleToken
        .connect(governance)
        .approve(saddleToken.address, MAX_UINT256)

      // Call `deployNewVestingContract` for each vesting recipient
      for (const vestingReciepient of vestingRecipients) {
        // Preview the address
        const cloneAddress = await saddleToken
          .connect(governance)
          .callStatic.deployNewVestingContract(vestingReciepient)

        // Push the address to vesting contracts array
        vestingContracts.push(
          (await ethers.getContractAt("Vesting", cloneAddress)) as Vesting,
        )

        await saddleToken
          .connect(governance)
          .deployNewVestingContract(vestingReciepient)
      }

      // Send the token to addresses without vesting
      const approvedTransferees = []
      for (const nonVestingRecipient of nonVestingRecipients) {
        await saddleToken
          .connect(governance)
          .transfer(nonVestingRecipient.to, nonVestingRecipient.amount)
        approvedTransferees.push(nonVestingRecipient.to)
      }

      // Let those addresses transfer the token
      await saddleToken
        .connect(governance)
        .addToAllowedList(approvedTransferees)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("minting", () => {
    it("Successfully mints to appropriate addresses and vestings", async () => {
      // Vesting addresses and contracts
      expect(await saddleToken.balanceOf(await signers[10].getAddress())).to.eq(
        0,
      )
      expect(await saddleToken.balanceOf(await signers[11].getAddress())).to.eq(
        0,
      )
      expect(await saddleToken.balanceOf(await signers[12].getAddress())).to.eq(
        0,
      )
      expect(await saddleToken.balanceOf(vestingContracts[0].address)).to.eq(
        BIG_NUMBER_1E18.mul(2e8),
      )
      expect(await saddleToken.balanceOf(vestingContracts[1].address)).to.eq(
        BIG_NUMBER_1E18.mul(2e8),
      )
      expect(await saddleToken.balanceOf(vestingContracts[2].address)).to.eq(
        BIG_NUMBER_1E18.mul(2e8),
      )

      // Non-vesting addresses
      expect(await saddleToken.balanceOf(await signers[13].getAddress())).to.eq(
        BIG_NUMBER_1E18.mul(2e8),
      )
      expect(await saddleToken.balanceOf(await signers[14].getAddress())).to.eq(
        BIG_NUMBER_1E18.mul(2e8),
      )
    })
  })

  describe("totalSupply", () => {
    it("Successfully mints max supply (1e9 with 1e18 decimals) on deployment", async () => {
      expect(await saddleToken.totalSupply()).to.eq(BIG_NUMBER_1E18.mul(1e9))
    })
  })

  describe("govCanUnpauseAfter", () => {
    it("Successfully sets govCanUnpauseAfter to be in the future on deployment", async () => {
      expect(await saddleToken.govCanUnpauseAfter()).to.eq(
        BigNumber.from(startTimestamp).add(PAUSE_PERIOD),
      )
    })
  })

  describe("anyoneCanUnpauseAfter", () => {
    it("Successfully sets anyoneCanUnpauseAfter to be 1 year after the deployment", async () => {
      expect(await saddleToken.anyoneCanUnpauseAfter()).to.eq(
        BigNumber.from(startTimestamp).add("31449600"),
      )
    })
  })

  describe("governance", () => {
    it("Successfully sets the governance address on deployment", async () => {
      expect(await saddleToken.governance()).to.eq(governanceAddress)
    })
  })

  describe("transfer", () => {
    it("Successfully transfers from an allowed address when paused", async () => {
      await saddleToken
        .connect(signers[13])
        .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8))
      expect(await saddleToken.balanceOf(deployerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(1e8),
      )
    })

    it("Reverts when transfers from a not-allowed address to an allowed address when paused", async () => {
      await saddleToken
        .connect(signers[13])
        .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8))
      await expect(
        saddleToken.transfer(
          await signers[13].getAddress(),
          BIG_NUMBER_1E18.mul(1e8),
        ),
      ).to.be.revertedWith("SDL: paused")
    })

    it("Reverts when transfers between not-allowed addresses when paused", async () => {
      await saddleToken
        .connect(signers[13])
        .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8))
      await expect(
        saddleToken.transfer(
          await signers[16].getAddress(),
          BIG_NUMBER_1E18.mul(1e8),
        ),
      ).to.be.revertedWith("SDL: paused")
    })
  })

  describe("enableTransfer", () => {
    it("Reverts when governance attempts to unpause before govCanUnpauseAfter", async () => {
      expect(await saddleToken.govCanUnpauseAfter()).to.gt(
        await getCurrentBlockTimestamp(),
      )
      await expect(
        saddleToken.connect(governance).enableTransfer(),
      ).to.be.revertedWith("SDL: cannot enable transfer yet")
    })

    it("Reverts when non-governance attempts to unpause after govCanUnpauseAfter", async () => {
      await setTimestamp(
        (await saddleToken.govCanUnpauseAfter()).add(1).toNumber(),
      )
      expect(await saddleToken.govCanUnpauseAfter()).to.lte(
        await getCurrentBlockTimestamp(),
      )

      await expect(
        saddleToken.connect(deployer).enableTransfer(),
      ).to.be.revertedWith("SDL: cannot enable transfer yet")
    })

    it("Succeeds when governance attempts to unpause after govCanUnpauseAfter", async () => {
      await setTimestamp(
        (await saddleToken.govCanUnpauseAfter()).add(1).toNumber(),
      )
      expect(await saddleToken.govCanUnpauseAfter()).to.lte(
        await getCurrentBlockTimestamp(),
      )

      await saddleToken.connect(governance).enableTransfer()
      expect(await saddleToken.paused()).to.be.false
    })

    it("Succeeds when non-governance attempts to unpause after anyoneCanUnpauseAfter", async () => {
      await setTimestamp(
        (await saddleToken.anyoneCanUnpauseAfter()).add(1).toNumber(),
      )
      expect(await saddleToken.anyoneCanUnpauseAfter()).to.lte(
        await getCurrentBlockTimestamp(),
      )

      await saddleToken.enableTransfer()
      expect(await saddleToken.paused()).to.be.false
    })

    it("Reverts when attempting to call enableTransfer after it is already unpaused", async () => {
      await setTimestamp(
        (await saddleToken.anyoneCanUnpauseAfter()).add(1).toNumber(),
      )
      expect(await saddleToken.anyoneCanUnpauseAfter()).to.lte(
        await getCurrentBlockTimestamp(),
      )

      await saddleToken.enableTransfer()
      expect(await saddleToken.paused()).to.be.false

      await expect(
        saddleToken.connect(deployer).enableTransfer(),
      ).to.be.revertedWith("SDL: transfer is enabled")
    })

    describe("transfer after enableTransfer", () => {
      beforeEach(async () => {
        await setTimestamp(
          (await saddleToken.govCanUnpauseAfter()).add(1).toNumber(),
        )
        await saddleToken.connect(governance).enableTransfer()
      })

      it("Succeeds when transferring from an allowed address", async () => {
        await saddleToken
          .connect(signers[13])
          .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8))
        expect(await saddleToken.balanceOf(deployerAddress)).to.eq(
          BIG_NUMBER_1E18.mul(1e8),
        )
      })

      it("Succeeds when transferring from a not-allowed address to an allowed address", async () => {
        await saddleToken
          .connect(signers[13])
          .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8))
        await saddleToken.transfer(
          await signers[13].getAddress(),
          BIG_NUMBER_1E18.mul(1e8),
        )
        expect(await saddleToken.balanceOf(deployerAddress)).to.eq(
          BIG_NUMBER_ZERO,
        )
      })

      it("Succeeds when transferring between not-allowed addresses", async () => {
        await saddleToken
          .connect(signers[13])
          .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8))
        await saddleToken.transfer(
          await signers[16].getAddress(),
          BIG_NUMBER_1E18.mul(1e8),
        )
        expect(
          await saddleToken.balanceOf(await signers[16].getAddress()),
        ).to.be.eq(BIG_NUMBER_1E18.mul(1e8))
      })
    })
  })

  describe("addToAllowedList", () => {
    it("Succeeds to add an address to the allowed list", async () => {
      // Add deployerAddress to the allowed list
      await saddleToken.connect(governance).addToAllowedList([deployerAddress])
      // Try transferring tokens to and from deployerAddress
      await saddleToken
        .connect(signers[13])
        .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8))
      await saddleToken.transfer(
        await signers[16].getAddress(),
        BIG_NUMBER_1E18.mul(1e8),
      )
      expect(
        await saddleToken.balanceOf(await signers[16].getAddress()),
      ).to.be.eq(BIG_NUMBER_1E18.mul(1e8))
    })

    it("Reverts when called by non-governance", async () => {
      await expect(
        saddleToken.connect(deployer).addToAllowedList([deployerAddress]),
      ).to.be.revertedWith("only governance can perform this action")
    })
  })

  describe("removeFromAllowedList", () => {
    it("Succeeds to remove an address from the allowed list", async () => {
      // Remove signers[13] from the allowed list
      await saddleToken
        .connect(governance)
        .removeFromAllowedList([await signers[13].getAddress()])
      // Try transferring tokens from the removed address
      await expect(
        saddleToken
          .connect(signers[13])
          .transfer(deployerAddress, BIG_NUMBER_1E18.mul(1e8)),
      ).to.be.revertedWith("SDL: paused")
    })

    it("Reverts when called by non-governance", async () => {
      await expect(
        saddleToken
          .connect(deployer)
          .removeFromAllowedList([await signers[13].getAddress()]),
      ).to.be.revertedWith("only governance can perform this action")
    })
  })

  describe("changeGovernance & acceptGovernance", () => {
    it("Reverts when called by other than the governance", async () => {
      await expect(
        saddleToken.connect(deployer).changeGovernance(deployerAddress),
      ).to.be.revertedWith("only governance can perform this action")
    })

    it("Succeeds to change governance", async () => {
      await saddleToken.connect(governance).changeGovernance(deployerAddress)
      expect(await saddleToken.governance()).to.be.eq(governanceAddress)
      await saddleToken.connect(deployer).acceptGovernance()
      expect(await saddleToken.governance()).to.be.eq(deployerAddress)
      expect(await saddleToken.pendingGovernance()).to.be.eq(ZERO_ADDRESS)
    })

    it("Reverts when accepting governance when changeGovernance is not called before", async () => {
      await expect(
        saddleToken.connect(deployer).acceptGovernance(),
      ).to.be.revertedWith("changeGovernance must be called first")
    })

    it("Reverts when accepting governance when called by other than pendingGovernance", async () => {
      await saddleToken.connect(governance).changeGovernance(deployerAddress)
      expect(await saddleToken.pendingGovernance()).to.be.eq(deployerAddress)
      await expect(
        saddleToken.connect(signers[13]).acceptGovernance(),
      ).to.be.revertedWith("only pendingGovernance can accept this role")
    })
  })

  describe("rescueToken", () => {
    it("Successfully rescues ETH", async () => {
      const balanceBefore = await deployer.getBalance()
      await saddleToken
        .connect(governance)
        .rescueTokens(ZERO_ADDRESS, deployerAddress, 0)
      expect((await deployer.getBalance()).sub(balanceBefore)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
    })

    it("Successfully rescues specific amount of ETH", async () => {
      await expect(
        saddleToken
          .connect(governance)
          .rescueTokens(ZERO_ADDRESS, deployerAddress, BIG_NUMBER_1E18),
      ).to.changeEtherBalance(deployer, BIG_NUMBER_1E18)
    })

    it("Successfully rescues ERC20", async () => {
      await deployments.deploy("DummyToken", {
        from: deployerAddress,
        contract: "GenericERC20WithGovernance",
        args: ["DummyToken", "TOKEN", 18],
      })
      const dummyToken = await ethers.getContract("DummyToken")
      await dummyToken.mint(saddleToken.address, BIG_NUMBER_1E18.mul(10000))

      await expect(
        saddleToken
          .connect(governance)
          .rescueTokens(dummyToken.address, deployerAddress, 0),
      ).to.changeTokenBalances(
        dummyToken,
        [await deployer.getAddress(), saddleToken.address],
        [BIG_NUMBER_1E18.mul(10000), BIG_NUMBER_1E18.mul(-10000)],
      )
    })

    it("Successfully rescues specific amounts of ERC20", async () => {
      await deployments.deploy("DummyToken", {
        from: deployerAddress,
        contract: "GenericERC20WithGovernance",
        args: ["DummyToken", "TOKEN", 18],
      })
      const dummyToken = await ethers.getContract("DummyToken")
      await dummyToken.mint(saddleToken.address, BIG_NUMBER_1E18.mul(10000))

      await expect(
        saddleToken
          .connect(governance)
          .rescueTokens(dummyToken.address, deployerAddress, BIG_NUMBER_1E18),
      ).to.changeTokenBalances(
        dummyToken,
        [await deployer.getAddress(), saddleToken.address],
        [BIG_NUMBER_1E18, BIG_NUMBER_1E18.mul(-1)],
      )
    })

    it("Reverts when called by non-governance", async () => {
      await expect(
        saddleToken
          .connect(deployer)
          .rescueTokens(ZERO_ADDRESS, deployerAddress, 0),
      ).to.be.revertedWith("only governance can perform this action")
    })
  })
})
