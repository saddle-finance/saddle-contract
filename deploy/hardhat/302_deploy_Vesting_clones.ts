import { BigNumber } from "ethers"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
} from "../../test/testUtils"

import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const getFirstRoundAllocation = function (amount: number): BigNumber {
  return BIG_NUMBER_1E18.mul(90_000_000).mul(amount).div(1170000)
}

const getSecondRoundAllocation = function (amount: number): BigNumber {
  return BIG_NUMBER_1E18.mul(105_000_000).mul(amount).div(3150000)
}

const getThirdRoundAllocation = function (amount: number): BigNumber {
  return BIG_NUMBER_1E18.mul(30_000_000).mul(amount).div(7500000)
}

const FIRST_ROUND_INVESTORS: { [address: string]: number } = {
  "0x3b08AA814bEA604917418A9F0907E7fC430e742C": 400000,
  "0x987FC4FC9aba7fFbDb3E8d0F9FfED364E01DC18c": 170000,
  "0xdB7A80DdfDeB83573636B84862803bB07317194C": 150000,
  "0xCf67910ed04fB23a2ccff3A4bEC259Bb0bf3841c": 50000,
  "0x23F322Fe50BD1eb7488bAbA33dA56A95Bd2f5815": 50000,
  "0x6C2a066B6CE2872BD5398347E97223C6F6F84104": 30000,
  "0x83b1a48376E045D26420200345414e6b93066396": 30000,
  "0x4F20Cb7a1D567A54350a18DAcB0cc803aEBB4483": 30000,
  "0xc90eA4d8D214D548221EE3622a8BE1D61f7077A2": 30000,
  "0xB3E2B1808ab9e81F3Abfc8C9f78B1dD680Cef948": 20000,
  "0x50AdF7A75d7cD6132ACc0a2FB21C019011286635": 20000,
  "0xde3258c1c45a557f4924d1e4e3d0a4e5341607ee": 20000,
  "0x30A14d1BfBa95f1867a67Ae8C18A950075592C99": 20000,
  "0x67E3ea119E141406c37e2CA783b749Fe1437673f": 20000,
  "0x8d7C49bF99861A4A189F8adf7882BD85f47E298D": 20000,
  "0x9AF628d4Fb349c2bA6B4813bBde613A1668b346c": 20000,
  "0x5e1042b15B3B0Cf1875A7e9Ea379A9e75318a099": 20000,
  "0x231A07C825f052B895DE5FD1513CE40D18E14aF5": 20000,
  "0x973B1E385659E317Dd43B49C29E45e66c0275696": 20000,
  "0x79129d8A02d60D9E9AcF47632B11fC56DE3EcB08": 20000,
  // "TODO 5": 10000,
}

const SECOND_ROUND_INVESTORS: { [address: string]: number } = {
  "0x74c5E6Dc988989D3025292C94d36B9e0ABBcf3d0": 1000000,
  "0xda7Dc67829F5c1Ad7eC4C6174a6Fbbc722229a40": 1000000,
  "0xA44ED7D06cbEE6F7d166A7298Ec61724C08163F5": 750000,
  "0xe5D0Ef77AED07C302634dC370537126A2CD26590": 100000,
  "0x43Bf99D656be7c354B26e63F01f18faB88714D64": 50000,
  "0x6b339824883E59676EA605260E4DdA71DcCA29Ae": 25000,
  "0x4d108e41b380AeCd04693690996192BEEe29174c": 25000,
  // "TODO 2": 25000,
  "0x4e7541783a0256e0EEf6cCA2b175Da79548db269": 25000,
  // "TODO 3": 25000,
  "0xe016ec54349e1fdc09c86878f25760ed317a7911": 25000,
  "0x7fCAf93cc92d51c490FFF701fb2C6197497a80db": 25000,
  "0xb4d47Add34a5dF5Ce64DdC6e926A99fc1F8F817f": 25000,
  "0x92DE4fF2037f8508c8A2D8EfB61868B284c6081c": 20000,
  "0xdd85061c99d4c6F4B199333ccE156CD5C6dc03a3": 20000,
  "0xf75B575FB27BEF41bb2825E96Dc53D5E95BA26Fe": 10000,
}

const THIRD_ROUND_INVESTORS: { [address: string]: number } = {
  "0x89a88bcfe0A8BB0BD240FACf5f20385Cdc48eC4C": 3000000,
  "0xbf6b82232Ab643ffb85578868B74919fE30E26e2": 2675625,
  "0x72E5f354645e8212D3Fa9B80717E6c31887eAa7F": 324375,
  "0xFcfBF39D5211498AfD8a00C07AAD44A2a96118d0": 294138,
  "0xe2eC0bC10C1ac3510a6687481d2dFa567e340469": 255000,
  "0x806b885aCb0494925c68C279C2A1D3C03ed67FC6": 165862,
  "0xdB7A80DdfDeB83573636B84862803bB07317194C": 150000,
  "0x3631401a11ba7004d1311e24d177b05ece39b4b3": 150000,
  "0xaC136EdAa6e5280e344dd3a2d463d7C5Ed93cDC5": 83060,
  "0xcA59254EF758Ddfa5aae350422Fdd816c11D9031": 75000,
  "0x8D60876891Ed33e0d40Ff677baDb9b8A9E775CC5": 50000,
  "0xd9d77Edc0650261e0b2b1F99327d538A613BF930": 50000,
  "0xA58d1ebC8f9526fBdAE0aeb12532D13BA2ddf871": 50000,
  "0x2550761D44e709710C15B718B2B73A65151a8488": 40000,
  "0x156c2d0D9CfA744615b022229026423E24a566ee": 25000,
  "0xbB49444efe86b167d1Cc35C79A9eb39110DbD5E3": 25000,
  "0xb9136F75e4F0eFAb9869c6C1d4659E3a585E9091": 20000,
  "0x44692cd1FBd67acFA3cA0c089B4f06dFae07df79": 16940,
  "0x546560eFB65988D2c94E37b59CA11629C8584f91": 10000,
  "0x84ADB7653B176A5cEeBCe0b927f83F0D3eFD89c7": 10000,
  "0x3f1f7df41cce79f4840067106184079236784ad2": 10000,
  "0x4e33D9523AB9CC36cDf923dEe0E8a7d11308595b": 10000,
  "0x31421C442c422BD16aef6ae44D3b11F404eeaBd9": 10000,
}

const MULTISIG_ADDRESS = "0x3F8E527aF4e0c6e763e8f368AC679c44C45626aE"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, get, execute } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  interface Recipient {
    to: string
    amount: BigNumber
    startTimestamp: BigNumber
    cliffPeriod: BigNumber
    durationPeriod: BigNumber
  }

  // Investor vesting schedule
  const TWO_YEARS_IN_SEC = BigNumber.from(2).mul(365).mul(24).mul(60).mul(60)

  // Team/advisor vesting schedule
  const THREE_YEARS_IN_SEC = BigNumber.from(3).mul(365).mul(24).mul(60).mul(60)

  // Tuesday, November 16, 2021 12:00:00 AM UTC
  // This cannot be set in the future!
  const TOKEN_LAUNCH_TIMESTAMP = BigNumber.from(
    await getCurrentBlockTimestamp(),
  )

  // Wednesday, July 7, 2021 12:00:00 AM UTC
  const FIRST_BATCH_TEAM_VESTING_START_TIMESTAMP = BigNumber.from(1625616000)

  // Monday, October 4, 2021 12:00:00 AM UTC
  const SECOND_BATCH_TEAM_VESTING_START_TIMESTAMP = BigNumber.from(1633305600)

  const investorGrants: { [address: string]: BigNumber } = {}

  // Combine grants across rounds so that we only deploy a single vesting contract for any given address
  for (const [address, amount] of Object.entries(FIRST_ROUND_INVESTORS)) {
    if (investorGrants[address]) {
      investorGrants[address] = investorGrants[address].add(
        getFirstRoundAllocation(amount),
      )
    } else {
      investorGrants[address] = getFirstRoundAllocation(amount)
    }
  }

  for (const [address, amount] of Object.entries(SECOND_ROUND_INVESTORS)) {
    if (investorGrants[address]) {
      investorGrants[address] = investorGrants[address].add(
        getSecondRoundAllocation(amount),
      )
    } else {
      investorGrants[address] = getSecondRoundAllocation(amount)
    }
  }

  for (const [address, amount] of Object.entries(THIRD_ROUND_INVESTORS)) {
    if (investorGrants[address]) {
      investorGrants[address] = investorGrants[address].add(
        getThirdRoundAllocation(amount),
      )
    } else {
      investorGrants[address] = getThirdRoundAllocation(amount)
    }
  }

  const investorRecipients: Recipient[] = []

  for (const [address, amount] of Object.entries(investorGrants)) {
    investorRecipients.push({
      to: address,
      amount: amount,
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: TWO_YEARS_IN_SEC,
    })
  }

  const protocolRecipients: Recipient[] = [
    // Protocol treasury
    {
      to: MULTISIG_ADDRESS,
      amount: BIG_NUMBER_1E18.mul(300_000_000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
  ]

  const teamRecipients: Recipient[] = [
    // First batch of team grants
    {
      to: "0x27E2E09a84BaE20C2a9667594896EaF132c862b7",
      amount: BIG_NUMBER_1E18.mul(120_000_000),
      startTimestamp: FIRST_BATCH_TEAM_VESTING_START_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    {
      to: "0xD9AED190e9Ae62b59808537D2EBD9E123eac4703",
      amount: BIG_NUMBER_1E18.mul(8_000_000),
      startTimestamp: FIRST_BATCH_TEAM_VESTING_START_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    {
      to: "0x82AbEDF193942a6Cdc4704A8D49e54fE51160E99",
      amount: BIG_NUMBER_1E18.mul(12_000_000),
      startTimestamp: FIRST_BATCH_TEAM_VESTING_START_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    // Second batch of team grants
    {
      to: "0xc4266Db4A83165Bf1284b564853BFB4DE553C3E1",
      amount: BIG_NUMBER_1E18.mul(6_500_000),
      startTimestamp: SECOND_BATCH_TEAM_VESTING_START_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    {
      to: "0xcb10D759cAaA8eC12a4D2E59F9d55018Dd8B1C9a",
      amount: BIG_NUMBER_1E18.mul(8_500_000),
      startTimestamp: SECOND_BATCH_TEAM_VESTING_START_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    {
      to: "0xC13F274e5608C6976463fB401EcAbd7301187937",
      amount: BIG_NUMBER_1E18.mul(100_000),
      startTimestamp: SECOND_BATCH_TEAM_VESTING_START_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    {
      to: "0xa1fC498f0D5ad41d3d1317Fc1dBcBA54e951a2fb",
      amount: BIG_NUMBER_1E18.mul(1_900_000),
      startTimestamp: SECOND_BATCH_TEAM_VESTING_START_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    // Third batch of team grants
    {
      to: "0x6265aaFC8D25B36f97181C44d0EB6693f00EbA17",
      amount: BIG_NUMBER_1E18.mul(2_000_000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
  ]

  const advisorRecipients: Recipient[] = [
    // Advisors
    {
      to: "0x779492ADFff61f10e224184201979C97Cf7B1ED4",
      amount: BIG_NUMBER_1E18.mul(2_000_000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
    {
      to: "0x60063d83E8AB6f2266b6eFcbfa985640CDD3Fc90",
      amount: BIG_NUMBER_1E18.mul(4_000_000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
  ]

  const encodeRecipients: Recipient[] = [
    // Encode
    {
      to: "0xFABEcA5418bDC3A8289EC0FA5B04edEb1D09c90f",
      amount: BIG_NUMBER_1E18.mul(2_500_000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
  ]

  const thesisRecipients: Recipient[] = [
    // Thesis
    {
      to: "0x53AB8F38EE493d88553Ea6c2766d574E404e249B",
      amount: BIG_NUMBER_1E18.mul(100_000_000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: THREE_YEARS_IN_SEC,
    },
  ]

  const unexercisedWarrantRecipients = [
    // Vesting for un-exercised warrants
    {
      to: MULTISIG_ADDRESS,
      amount: getFirstRoundAllocation(10000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: TWO_YEARS_IN_SEC,
    },
    {
      to: MULTISIG_ADDRESS,
      amount: getSecondRoundAllocation(25000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: TWO_YEARS_IN_SEC,
    },
    {
      to: MULTISIG_ADDRESS,
      amount: getSecondRoundAllocation(25000),
      startTimestamp: TOKEN_LAUNCH_TIMESTAMP,
      cliffPeriod: BigNumber.from(0),
      durationPeriod: TWO_YEARS_IN_SEC,
    },
  ]

  let totalAdvisorAmount = BigNumber.from(0)
  for (const recipient of advisorRecipients) {
    totalAdvisorAmount = totalAdvisorAmount.add(recipient.amount)
  }
  console.assert(
    totalAdvisorAmount.eq(BIG_NUMBER_1E18.mul(6_000_000)),
    `amounts did not match (got, expected): ${totalAdvisorAmount}, ${BIG_NUMBER_1E18.mul(
      6_000_000,
    )}`,
  )

  let totalTeamAmount = BigNumber.from(0)
  for (const recipient of [...teamRecipients, ...thesisRecipients]) {
    totalTeamAmount = totalTeamAmount.add(recipient.amount)
  }
  console.assert(
    totalTeamAmount.eq(BIG_NUMBER_1E18.mul(259_000_000)),
    `team amounts did not match (got, expected): ${totalTeamAmount}, ${BIG_NUMBER_1E18.mul(
      259_000_000,
    )}`,
  )

  let totalInvestorAmount = BigNumber.from(0)
  for (const recipient of [
    ...investorRecipients,
    ...unexercisedWarrantRecipients,
  ]) {
    totalInvestorAmount = totalInvestorAmount.add(recipient.amount)
  }
  console.assert(
    totalInvestorAmount.eq(BIG_NUMBER_1E18.mul(225_000_000)),
    `investor amounts did not match (got, expected): ${totalInvestorAmount}, ${BIG_NUMBER_1E18.mul(
      225_000_000,
    )}`,
  )

  const vestingRecipients: Recipient[] = [
    ...protocolRecipients,
    ...teamRecipients,
    ...advisorRecipients,
    ...encodeRecipients,
    ...thesisRecipients,
    ...investorRecipients,
    ...unexercisedWarrantRecipients,
  ]

  // Approve the contract to use the token for deploying the vesting contracts
  await execute(
    "SDL",
    { from: deployer, log: true },
    "approve",
    (
      await get("SDL")
    ).address,
    MAX_UINT256,
  )

  // Deploy a new vesting contract clone for each recipient
  for (const recipient of vestingRecipients) {
    await execute(
      "SDL",
      {
        from: deployer,
        log: true,
      },
      "deployNewVestingContract",
      recipient,
    )
  }
}
export default func
func.tags = ["VestingClones"]
func.skip = async (env) => true
