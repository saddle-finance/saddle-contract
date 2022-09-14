import { ethers } from "hardhat"
import {
  AnyCallTranslator,
  ChildGauge,
  ChildGaugeFactory,
  ChildOracle,
  MockAnyCall,
  RootGaugeFactory,
  RootOracle,
  TransparentUpgradeableProxy__factory,
} from "../../build/typechain"

export const TEST_SIDE_CHAIN_ID = 11

export async function setupChildGaugeFactory(
  anyCallTranslatorAddress: string,
  ownerAddress: string,
  childOracleAddress: string,
): Promise<ChildGaugeFactory> {
  // Child Gauge factory
  const childGaugeFactoryFactory = await ethers.getContractFactory(
    "ChildGaugeFactory",
  )
  const childGaugeFactory = (await childGaugeFactoryFactory.deploy(
    anyCallTranslatorAddress,
    (
      await ethers.getContract("SDL")
    ).address,
    ownerAddress,
  )) as ChildGaugeFactory

  // Root Gauge Implementation
  const gaugeImplementationFactory = await ethers.getContractFactory(
    "ChildGauge",
  )
  const childGauge = (await gaugeImplementationFactory.deploy(
    (
      await ethers.getContract("SDL")
    ).address,
    childGaugeFactory.address,
  )) as ChildGauge

  await childGaugeFactory.set_implementation(childGauge.address)
  await childGaugeFactory.set_voting_escrow(childOracleAddress)

  return childGaugeFactory
}

export async function setupRootGaugeFactory(
  anyCallTranslatorAddress: string,
  ownerAddress: string,
): Promise<RootGaugeFactory> {
  const rootGaugeFactoryFactory = await ethers.getContractFactory(
    "RootGaugeFactory",
  )
  const rootGaugeFactory = (await rootGaugeFactoryFactory.deploy(
    anyCallTranslatorAddress,
    ownerAddress,
  )) as RootGaugeFactory

  const mockBridgerFactory = await ethers.getContractFactory("MockBridger")
  const mockBridger = await mockBridgerFactory.deploy()
  // Set Bridger to mock bridger
  await rootGaugeFactory.set_bridger(TEST_SIDE_CHAIN_ID, mockBridger.address)

  // Root Gauge Implementation
  const gaugeImplementationFactory = await ethers.getContractFactory(
    "RootGauge",
  )
  const rootGauge = await gaugeImplementationFactory.deploy(
    (
      await ethers.getContract("SDL")
    ).address,
    (
      await ethers.getContract("GaugeController")
    ).address,
    (
      await ethers.getContract("Minter")
    ).address,
  )
  await rootGaugeFactory.set_implementation(rootGauge.address)

  return rootGaugeFactory
}

export async function setupAnyCallTranslator(ownerAddress: string): Promise<{
  anyCallTranslator: AnyCallTranslator
  mockAnycall: MockAnyCall
}> {
  // Deploy mock anycall
  const mockAnycallFactory = await ethers.getContractFactory("MockAnyCall")
  const mockAnycall = (await mockAnycallFactory.deploy()) as MockAnyCall

  // Deploy ProxyAdmin
  const proxyAdminFactory = await ethers.getContractFactory("ProxyAdmin")
  const proxyAdmin = await proxyAdminFactory.deploy()

  // Deploy AnycallTranslator with mock anycall
  const anycallTranslatorFactory = await ethers.getContractFactory(
    "AnyCallTranslator",
  )
  const anycallTranslatorLogic =
    (await anycallTranslatorFactory.deploy()) as AnyCallTranslator

  // Deploy the proxy that will be used as AnycallTranslator
  // We want to set the owner of the logic level to be deployer
  const initializeCallData = (
    await anycallTranslatorLogic.populateTransaction.initialize(
      ownerAddress,
      mockAnycall.address,
    )
  ).data as string

  // Deploy the proxy with anycall translator logic and initialize it
  const proxyFactory: TransparentUpgradeableProxy__factory =
    await ethers.getContractFactory("TransparentUpgradeableProxy")
  const proxy = await proxyFactory.deploy(
    anycallTranslatorLogic.address,
    proxyAdmin.address,
    initializeCallData,
  )
  const anyCallTranslator = (await ethers.getContractAt(
    "AnyCallTranslator",
    proxy.address,
  )) as AnyCallTranslator

  await mockAnycall.setanyCallTranslator(anyCallTranslator.address)
  return { anyCallTranslator, mockAnycall }
}

export async function setupRootOracle(
  anyCallTranslatorAddress: string,
  rootGaugeFactoryAddress: string,
): Promise<RootOracle> {
  const rootOracleFactory = await ethers.getContractFactory("RootOracle")

  const rootOracle = (await rootOracleFactory.deploy(
    rootGaugeFactoryAddress,
    (
      await ethers.getContract("VotingEscrow")
    ).address,
    anyCallTranslatorAddress,
  )) as RootOracle
  return rootOracle
}

export async function setupChildOracle(
  anyCallTranslatorAddress: string,
): Promise<ChildOracle> {
  const childOracleFactory = await ethers.getContractFactory("ChildOracle")
  const childOracle = await childOracleFactory.deploy(anyCallTranslatorAddress)
  return childOracle as ChildOracle
}
