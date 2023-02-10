import chai from "chai"
import { Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  GenericERC20WithGovernance,
  RetroactiveVesting,
} from "../build/typechain/"
import * as merkleTreeData from "./merkleTree.json"
import {
  BIG_NUMBER_1E18,
  forceAdvanceOneBlock,
  getCurrentBlockTimestamp,
  getDeployedContractByName,
  setNextTimestamp,
  setTimestamp,
  ZERO_ADDRESS,
} from "./testUtils"

const { expect } = chai

const WEEK = 604800

interface MerkleTree {
  merkleRoot: string
  recipients: {
    [account: string]: {
      amount: string
      proof: string[]
    }
  }
}

const merkleTree: MerkleTree = <MerkleTree>merkleTreeData

describe("Retroactive Vesting", () => {
  let signers: Array<Signer>
  let deployer: Signer
  let deployerAddress: string
  let user1: Signer
  let user1Address: string
  let user2: Signer
  let user2Address: string
  let malActor: Signer
  let dummyToken: GenericERC20WithGovernance
  let retroactiveVesting: RetroactiveVesting
  let startTimestamp: number

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { deploy } = deployments
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      deployerAddress = await deployer.getAddress()
      user1 = signers[1]
      user1Address = await user1.getAddress()
      user2 = signers[2]
      user2Address = await user2.getAddress()
      malActor = signers[10]

      await deploy("DummyToken", {
        contract: "GenericERC20WithGovernance",
        args: ["DummyToken", "TOKEN", 18],
        log: true,
        skipIfAlreadyDeployed: true,
        from: deployerAddress,
      })

      dummyToken = (await getDeployedContractByName(
        deployments,
        "DummyToken",
      )) as GenericERC20WithGovernance

      startTimestamp = await getCurrentBlockTimestamp()

      await deploy("RetroactiveVesting", {
        from: deployerAddress,
        args: [dummyToken.address, merkleTree.merkleRoot, startTimestamp],
        log: true,
      })

      retroactiveVesting = (await getDeployedContractByName(
        deployments,
        "RetroactiveVesting",
      )) as RetroactiveVesting

      await dummyToken.mint(
        retroactiveVesting.address,
        BIG_NUMBER_1E18.mul(1_000_000),
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("verifyAndClaimReward", () => {
    beforeEach(async () => {
      await setNextTimestamp(startTimestamp + 52 * WEEK)
    })
    it("Reverts when giving invalid proof", async () => {
      await expect(
        retroactiveVesting.verifyAndClaimReward(
          deployerAddress,
          merkleTree.recipients[deployerAddress].amount,
          merkleTree.recipients[user1Address].proof,
        ),
      ).to.be.revertedWith("could not verify merkleProof")
    })

    it("Reverts when giving invalid amount", async () => {
      await expect(
        retroactiveVesting.verifyAndClaimReward(
          deployerAddress,
          merkleTree.recipients[user1Address].amount,
          merkleTree.recipients[deployerAddress].proof,
        ),
      ).to.be.revertedWith("could not verify merkleProof")
    })

    it("Successfully verifies and claims 0 tokens when startTimestamp is in the future", async () => {
      await forceAdvanceOneBlock()
      await deployments.deploy("RetroactiveVestingFuture", {
        from: deployerAddress,
        contract: "RetroactiveVesting",
        args: [
          dummyToken.address,
          merkleTree.merkleRoot,
          (await getCurrentBlockTimestamp()) + 10000,
        ],
      })
      const testContract: RetroactiveVesting = await ethers.getContract(
        "RetroactiveVestingFuture",
      )
      await testContract
        .connect(user1)
        .verifyAndClaimReward(
          deployerAddress,
          merkleTree.recipients[deployerAddress].amount,
          merkleTree.recipients[deployerAddress].proof,
        )
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(0),
      )
    })

    it("Successfully claims when giving correct proof and amount", async () => {
      await retroactiveVesting
        .connect(user1)
        .verifyAndClaimReward(
          deployerAddress,
          merkleTree.recipients[deployerAddress].amount,
          merkleTree.recipients[deployerAddress].proof,
        )
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(50000),
      )
    })

    it("Successfully claims for someone else when giving correct proof and amount", async () => {
      await retroactiveVesting.verifyAndClaimReward(
        deployerAddress,
        merkleTree.recipients[deployerAddress].amount,
        merkleTree.recipients[deployerAddress].proof,
      )
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(50000),
      )
    })

    it("Successfully claims after verifying once", async () => {
      await retroactiveVesting.verifyAndClaimReward(
        deployerAddress,
        merkleTree.recipients[deployerAddress].amount,
        merkleTree.recipients[deployerAddress].proof,
      )
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(50000),
      )

      // 1 year and 6 months past start timestamp
      await setNextTimestamp(startTimestamp + 1.5 * 52 * WEEK)

      await retroactiveVesting.verifyAndClaimReward(
        deployerAddress,
        merkleTree.recipients[deployerAddress].amount,
        merkleTree.recipients[deployerAddress].proof,
      )
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(75000),
      )

      // 2 years past start timestamp
      await setNextTimestamp(startTimestamp + 2 * 52 * WEEK)

      await retroactiveVesting.verifyAndClaimReward(
        deployerAddress,
        merkleTree.recipients[deployerAddress].amount,
        merkleTree.recipients[deployerAddress].proof,
      )
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(100000),
      )

      // Try claiming once more
      await setNextTimestamp(startTimestamp + 3 * 52 * WEEK)
      await retroactiveVesting.verifyAndClaimReward(
        deployerAddress,
        merkleTree.recipients[deployerAddress].amount,
        merkleTree.recipients[deployerAddress].proof,
      )
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(100000),
      )
    })
  })

  describe("claimReward", () => {
    beforeEach(async () => {
      // Verify once
      await retroactiveVesting.verifyAndClaimReward(
        deployerAddress,
        merkleTree.recipients[deployerAddress].amount,
        merkleTree.recipients[deployerAddress].proof,
      )
    })

    it("Successfully claims reward by themselves", async () => {
      await setNextTimestamp(startTimestamp + 52 * WEEK)
      await retroactiveVesting.claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(50000),
      )

      await setNextTimestamp(startTimestamp + 1.5 * 52 * WEEK)
      await retroactiveVesting.claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(75000),
      )

      await setNextTimestamp(startTimestamp + 2 * 52 * WEEK)
      await retroactiveVesting.claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(100000),
      )
    })

    it("Successfully claims reward by themselves when providing zero address", async () => {
      await setNextTimestamp(startTimestamp + 52 * WEEK)
      await retroactiveVesting.claimReward(ZERO_ADDRESS)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(50000),
      )

      await setNextTimestamp(startTimestamp + 1.5 * 52 * WEEK)
      await retroactiveVesting.claimReward(ZERO_ADDRESS)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(75000),
      )

      await setNextTimestamp(startTimestamp + 2 * 52 * WEEK)
      await retroactiveVesting.claimReward(ZERO_ADDRESS)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(100000),
      )
    })

    it("Successfully claims reward for someone else", async () => {
      await setNextTimestamp(startTimestamp + 52 * WEEK)
      await retroactiveVesting.connect(user1).claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(50000),
      )

      await setNextTimestamp(startTimestamp + 1.5 * 52 * WEEK)
      await retroactiveVesting.connect(user1).claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(75000),
      )

      await setNextTimestamp(startTimestamp + 2 * 52 * WEEK)
      await retroactiveVesting.connect(user1).claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(100000),
      )
    })
  })

  describe("vestedAmount", () => {
    beforeEach(async () => {
      // Verify once
      await retroactiveVesting.verifyAndClaimReward(
        deployerAddress,
        merkleTree.recipients[deployerAddress].amount,
        merkleTree.recipients[deployerAddress].proof,
      )
    })

    it("Reverts when account is not yet verified", async () => {
      await expect(
        retroactiveVesting.vestedAmount(user1Address),
      ).to.be.revertedWith("must verify first")
    })

    it("Successfully outputs correct vested amounts", async () => {
      // 1 year since start
      await setTimestamp(startTimestamp + 52 * WEEK)
      expect(await retroactiveVesting.vestedAmount(deployerAddress)).to.be.eq(
        "49999995230463980463981",
      )
      await retroactiveVesting.claimReward(deployerAddress)
      expect(await retroactiveVesting.vestedAmount(deployerAddress)).to.be.eq(0)

      // 1.5 years since start
      await setTimestamp(startTimestamp + 1.5 * 52 * WEEK)
      expect(await retroactiveVesting.vestedAmount(deployerAddress)).to.be.eq(
        "24999998410154660154661",
      )
      await retroactiveVesting.claimReward(deployerAddress)
      expect(await retroactiveVesting.vestedAmount(deployerAddress)).to.be.eq(0)

      // 2 years since start
      await setTimestamp(startTimestamp + 2 * 52 * WEEK)
      expect(await retroactiveVesting.vestedAmount(deployerAddress)).to.be.eq(
        "24999998410154660154661",
      )
      await retroactiveVesting.claimReward(deployerAddress)
      expect(await retroactiveVesting.vestedAmount(deployerAddress)).to.be.eq(0)

      // 3 years since start
      await setTimestamp(startTimestamp + 3 * 52 * WEEK)
      expect(await retroactiveVesting.vestedAmount(deployerAddress)).to.be.eq(0)
    })

    it("Successfully claims reward for someone else", async () => {
      await setNextTimestamp(startTimestamp + 52 * WEEK)
      await retroactiveVesting.connect(user1).claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(50000),
      )

      await setNextTimestamp(startTimestamp + 1.5 * 52 * WEEK)
      await retroactiveVesting.connect(user1).claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(75000),
      )

      await setNextTimestamp(startTimestamp + 2 * 52 * WEEK)
      await retroactiveVesting.connect(user1).claimReward(deployerAddress)
      expect(await dummyToken.balanceOf(deployerAddress)).to.be.eq(
        BIG_NUMBER_1E18.mul(100000),
      )
    })
  })
})
