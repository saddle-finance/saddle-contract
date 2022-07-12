import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../utils/accounts"
import { isTestNetwork } from "../utils/network"
import { getChainId } from "hardhat"
import { BigNumber } from "ethers"
import { ZERO_ADDRESS } from "../test/testUtils"
import { PoolRegistry, TestSwapReturnValues__factory } from "../build/typechain"
import { PoolType } from "../utils/constants"
import { IPoolRegistry } from "../build/typechain"

export interface IPoolDataInput {
  poolName: string
  basePoolName?: string
  tokenNames: string[]
  lpTokenSymbol: string
  initialA: number
  swapFee: number
  adminFee: number
}

export async function deployMetaswap(
  hre: HardhatRuntimeEnvironment,
  metaPoolName: string,
  basePoolName: string,
  tokenNames: string[],
  tokenDecimals: number[], // out
  lptokenName: string, //out
  lpTokenSymbol: string,
  initialA: number,
  swapFee: number,
  adminFee: number,
) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()
  const metaPoolLpTokenName = `${metaPoolName}LPToken`

  // Manually check if the pool is already deployed
  const metaPool = await getOrNull(metaPoolName)

  // Check if has been initialized
  const isInitialized: boolean = metaPool
    ? (await read(metaPoolName, "swapStorage")).lpToken !== ZERO_ADDRESS
    : false

  if (metaPool && isInitialized) {
    log(`reusing ${metaPoolName} at ${metaPool.address}`)
  } else {
    const tokenAddresses = await Promise.all(
      tokenNames.map(async (name) => (await get(name)).address),
    )

    tokenDecimals = await Promise.all(
      tokenNames.map(async (name) => await read(name, "decimals")),
    )

    // deploy the metapool
    await deploy(metaPoolName, {
      from: deployer,
      log: true,
      contract: "MetaSwap",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })

    // initalize metapool with starting values
    await execute(
      metaPoolName,
      {
        from: deployer,
        log: true,
      },
      "initializeMetaSwap",
      tokenAddresses,
      tokenDecimals,
      lptokenName,
      lpTokenSymbol,
      initialA,
      swapFee,
      adminFee,
      (
        await get("LPToken")
      ).address,
      (
        await get(basePoolName)
      ).address,
    )

    await execute(
      metaPoolName,
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[await getChainId()],
    )

    // deploy the Meta Swap Deposit
    await deployMetaswapDeposit(
      hre,
      `${metaPoolName}Deposit`,
      basePoolName,
      metaPoolName,
    )

    // get lptoken address (was deployed by the metaswap contract)
    const lpTokenAddress = (await read(metaPoolName, "swapStorage")).lpToken
    log(`deployed ${metaPoolLpTokenName} at ${lpTokenAddress}`)

    // save lptoken deployment
    await save(metaPoolLpTokenName, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}

export async function deployMetaswapPools(
  hre: HardhatRuntimeEnvironment,
  pools: IPoolDataInput[],
) {
  const newDeploypools = await checkIfPoolDeployed(hre, pools)

  for (let i = 0; i < newDeploypools.length; i++) {
    const pool = newDeploypools[i]
    const metaPoolName = pool.poolName
    console.log(`Attempting to deploy pool with name: ${metaPoolName}`)
    const basePoolName = pool.basePoolName
    const tokenNames = pool.tokenNames
    tokenNames.push(`${basePoolName}LPToken`)
    const lpTokenSymbol = pool.lpTokenSymbol
    const initialA = pool.initialA
    const swapFee = pool.swapFee
    const adminFee = pool.adminFee

    const { deployments, getNamedAccounts } = hre
    const { execute, deploy, get, getOrNull, log, read, save } = deployments
    const { deployer } = await getNamedAccounts()
    const lpTokenName = `${metaPoolName}LPToken`
    console.log("Attempting to get token addresses")
    const tokenAddresses = await Promise.all(
      tokenNames.map(async (name) => (await get(name)).address),
    )

    const tokenDecimals = await Promise.all(
      tokenNames.map(async (name) => await read(name, "decimals")),
    )

    // deploy the metapool
    console.log("Deploying the metapool")
    await deploy(metaPoolName, {
      from: deployer,
      log: true,
      contract: "MetaSwap",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })

    // initalize metapool with starting values
    console.log("Initializing MetaSwap")
    await execute(
      metaPoolName,
      {
        from: deployer,
        log: true,
      },
      "initializeMetaSwap",
      tokenAddresses,
      tokenDecimals,
      lpTokenName,
      lpTokenSymbol,
      initialA,
      swapFee,
      adminFee,
      (
        await get("LPToken")
      ).address,
      (
        await get(basePoolName!)
      ).address,
    )

    await execute(
      metaPoolName,
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[await getChainId()],
    )

    // get lptoken address (was deployed by the metaswap contract)
    const lpTokenAddress = (await read(metaPoolName, "swapStorage")).lpToken
    log(`deployed ${lpTokenName} at ${lpTokenAddress}`)
    // save lptoken deployment
    console.log("saving lp token deployment")
    await save(lpTokenName, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })

    // deploy the Meta Swap Deposit
    console.log("Deploying Metaswap Deposit")
    await deployMetaswapDeposit(
      hre,
      `${metaPoolName}Deposit`,
      basePoolName!,
      metaPoolName,
    )
  }
}

export async function deployMetaswapDeposit(
  hre: HardhatRuntimeEnvironment,
  metaPoolDepositName: string,
  basePoolName: string,
  metaPoolName: string,
) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, read } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  const metaPoolDeposit = await getOrNull(metaPoolDepositName)
  // Check if it has been initialized
  const isInitialized = metaPoolDeposit
    ? (await read(metaPoolDepositName, "baseSwap")) !== ZERO_ADDRESS
    : false
  if (metaPoolDeposit && isInitialized) {
    log(`reusing ${metaPoolDepositName} at ${metaPoolDeposit.address}`)
  } else {
    // This is the first time deploying MetaSwapDeposit contract.
    await deploy(metaPoolDepositName, {
      from: deployer,
      log: true,
      contract: "MetaSwapDeposit",
      skipIfAlreadyDeployed: true,
    })

    await execute(
      metaPoolDepositName,
      { from: deployer, log: true },
      "initialize",
      (
        await get(basePoolName)
      ).address,
      (
        await get(metaPoolName)
      ).address,
      (
        await get(`${metaPoolName}LPToken`)
      ).address,
    )
  }
}

export async function deploySwapFlashLoan(
  hre: HardhatRuntimeEnvironment,
  poolName: string,
  tokenNames: string[],
  tokenDecimals: number[],
  lptokenName: string,
  lpTokenSymbol: string,
  initialA: number,
  swapFee: number,
  adminFee: number,
) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, getOrNull, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()
  const poolLpTokenName = `${poolName}LPToken`

  // Manually check if the pool is already deployed
  const poolContract = await getOrNull(poolName)

  // Check if has been initialized
  const isInitialized: boolean = poolContract
    ? (await read(poolName, "swapStorage")).lpToken !== ZERO_ADDRESS
    : false

  if (poolContract && isInitialized) {
    log(`reusing ${poolName} at ${poolContract.address}`)
  } else {
    const TOKEN_ADDRESSES = await Promise.all(
      tokenNames.map(async (name) => (await get(name)).address),
    )
    const tokenDecimals = await Promise.all(
      tokenNames.map(async (name) => await read(name, "decimals")),
    )

    await deploy(poolName, {
      from: deployer,
      log: true,
      contract: "SwapFlashLoan",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })
    await execute(
      poolName,
      {
        from: deployer,
        log: true,
      },
      "initialize",
      TOKEN_ADDRESSES,
      tokenDecimals,
      lptokenName,
      lpTokenSymbol,
      initialA,
      swapFee,
      adminFee,
      (
        await get("LPToken")
      ).address,
    )

    await execute(
      poolName,
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[await getChainId()],
    )

    const lpTokenAddress = (await read(poolName, "swapStorage")).lpToken
    log(`deployed ${poolLpTokenName} at ${lpTokenAddress}`)

    await save(poolLpTokenName, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
  }
}

export async function deploySwapFlashLoanPools(
  hre: HardhatRuntimeEnvironment,
  pools: IPoolDataInput[],
) {
  // filter out already deployed pools
  const newDeploypools = await checkIfPoolDeployed(hre, pools)
  for (let i = 0; i < newDeploypools.length; i++) {
    const pool = newDeploypools[i]
    const poolName = pool.poolName
    console.log(`Attempting to deploy pool with name: ${poolName}`)
    const tokenNames = pool.tokenNames
    const lpTokenSymbol = pool.lpTokenSymbol
    const initialA = pool.initialA
    const swapFee = pool.swapFee
    const adminFee = pool.adminFee

    const { deployments, getNamedAccounts } = hre
    const { execute, deploy, get, getOrNull, log, read, save } = deployments
    const { deployer } = await getNamedAccounts()
    const lpTokenName = `${poolName}LPToken`
    console.log("Attempting to get token addresses")
    const tokenAddresses = await Promise.all(
      tokenNames.map(async (name) => (await get(name)).address),
    )

    const tokenDecimals = await Promise.all(
      tokenNames.map(async (name) => await read(name, "decimals")),
    )

    // deploy the metapool
    console.log("Deploying the pool")
    await deploy(poolName, {
      from: deployer,
      log: true,
      contract: "SwapFlashLoan",
      skipIfAlreadyDeployed: true,
      libraries: {
        SwapUtils: (await get("SwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      },
    })

    await execute(
      poolName,
      {
        from: deployer,
        log: true,
      },
      "initialize",
      tokenAddresses,
      tokenDecimals,
      lpTokenName,
      lpTokenSymbol,
      initialA,
      swapFee,
      adminFee,
      (
        await get("LPToken")
      ).address,
    )

    await execute(
      poolName,
      { from: deployer, log: true },
      "transferOwnership",
      MULTISIG_ADDRESSES[await getChainId()],
    )

    // get lptoken address (was deployed by the metaswap contract)
    const lpTokenAddress = (await read(poolName, "swapStorage")).lpToken
    log(`deployed ${lpTokenName} at ${lpTokenAddress}`)

    // save lptoken deployment
    console.log("saving lp token deployment")
    await save(lpTokenName, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })
    // attempt to verify contract (fails on getting api key)
    // await verifyContract(hre, poolName)
  }
  // register new pools
  await registerPools(hre, newDeploypools)
}

async function checkIfPoolDeployed(
  hre: HardhatRuntimeEnvironment,
  pools: IPoolDataInput[],
) {
  const { deployments } = hre
  const { getOrNull, read } = deployments

  async function checkDeployed(poolName: string) {
    // Manually check if the pool is already deployed
    const pool = await getOrNull(poolName)
    // Check if has been initialized
    const isInitialized: boolean = pool
      ? (await read(poolName, "swapStorage")).lpToken !== ZERO_ADDRESS
      : false
    return isInitialized && pool
  }
  const newDeploypools = pools.filter((pool) => checkDeployed(pool.poolName))
  if (newDeploypools.length != 0) {
    console.log("****** New deployments detected ******")
    for (let i = 0; i < newDeploypools.length; i++) {
      console.log(`New pool to be deployed: ${newDeploypools[i].poolName}`)
    }
  }
  return newDeploypools
}

export async function checkTokens(
  hre: HardhatRuntimeEnvironment,
  tokenArgs: { [token: string]: any[] },
) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute } = deployments
  const { deployer } = await getNamedAccounts()

  for (const token in tokenArgs) {
    // If it's on hardhat, mint test tokens
    if (isTestNetwork(await getChainId())) {
      for (const token in tokenArgs) {
        await deploy(token, {
          from: deployer,
          log: true,
          contract: "GenericERC20",
          args: tokenArgs[token],
          skipIfAlreadyDeployed: true,
        })
        const decimals = tokenArgs[token][2]
        console.log(`minting: ${tokenArgs[token][0]}`)
        await execute(
          token,
          { from: deployer, log: true },
          "mint",
          deployer,
          BigNumber.from(10).pow(decimals).mul(1000000),
        )
      }
    }
  }
}

async function checkRegisteredPool(
  hre: HardhatRuntimeEnvironment,
  poolName: string,
) {
  const { ethers, deployments } = hre
  const { log } = deployments

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  await poolRegistry
    .getPoolDataByName(poolName)
    .then(() => {
      log("Skipping adding pools to registry because they are already added")
      return false
    })
    .catch(async () => {
      return true
    })
}

export async function registerPools(
  hre: HardhatRuntimeEnvironment,
  pools: IPoolDataInput[],
) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { execute, get } = deployments
  const { deployer } = await getNamedAccounts()
  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")
  const poolsToBeAdded = pools.filter((pool) =>
    checkRegisteredPool(hre, pool.poolName.toString()),
  )
  console.log(`Attempting to register ${poolsToBeAdded.length} pool[s]`)
  let poolsToBeRegistered: IPoolRegistry.PoolInputDataStruct[] = []
  poolsToBeAdded.forEach(async (pool) => {
    poolsToBeRegistered.push({
      poolAddress: (await get(pool.poolName)).address,
      typeOfAsset: PoolType.USD,
      poolName: ethers.utils.formatBytes32String(pool.tokenNames.join("-")),
      targetAddress: (await get("SwapFlashLoan")).address,
      metaSwapDepositAddress: ZERO_ADDRESS,
      isSaddleApproved: true,
      isRemoved: false,
      isGuarded: false,
    })
  })

  const batchCall = await Promise.all(
    poolsToBeRegistered.map(
      async (pool) => await poolRegistry.populateTransaction.addPool(pool),
    ),
  )
  const batchCallData = batchCall.map((x) => x.data).filter(Boolean)

  await execute(
    "PoolRegistry",
    { from: deployer, log: true },
    "batch",
    batchCallData,
    true,
  )
}

export async function verifyContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  constructors: any[] = [],
) {
  const { ethers } = hre
  const contract = await ethers.getContract(contractName)

  console.log(`attempting to verify contract: ${contractName}`)
  await hre.run("verify:verify", {
    address: contract.address,
    constructorArguments: constructors,
  })
  console.log(`Successfully verified ${contractName} at ${contract.address}`)
}
