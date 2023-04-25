import { expect } from "chai"
import { BigNumber } from "ethers"
import { getChainId } from "hardhat"
import { Address } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  GenericERC20,
  IPoolRegistry,
  MasterRegistry,
  PoolRegistry,
} from "../build/typechain"
import {
  convertGaugeNameToSalt,
  impersonateAccount,
  setEtherBalance,
  ZERO_ADDRESS,
} from "../test/testUtils"
import { ANYCALL_ADDRESS, MULTISIG_ADDRESSES } from "../utils/accounts"
import { PoolType } from "../utils/constants"
import { CHAIN_ID, isTestNetwork } from "../utils/network"

export interface PoolData {
  poolName: string // Name of the pool
  registryName?: string // Name pool with be registered under
  basePoolName?: string // Base pool for metaswap * only provided for metapools
  tokenArgs: { [token: string]: any[] } // <TOKEN(same as in /deployments)>: ["<Explorer Token Name>", "<Token symbol>", "<decimals>"],
  lpTokenSymbol: string // Name for LP Token that will be deployed with associated pool
  initialA: number // Initial amplification coefficient
  swapFee: number // % fee charged on swap
  adminFee: number // % of swapFee sent to Saddle
  multisig: boolean // If a multisig on this chain exists
  deployGauge?: boolean // If a gauge should be deployed
  metaswapDeposit?: string // Address of metaswap deposit contract
}

/**
 * @notice deploys a single metaswap pool, deploy the associated metaswapDeposit,
 * deploying the pool also deploys that pools LP token, saves the LP token deployment
 * @param metaPoolName name of the metaswap pool
 * @param basePoolName the base pool associate with the new metaswap
 * @param tokenNames array of token symbols that are mirrored in deployment folder
 * @param tokenDecimals array of token decimals mirroring token names
 * @param lptokenName name of the LP token to be deployed by the metaswap
 * @param lpTokenSymbol symbol used for LP token
 * @param initialA initial amplification coefficient
 * @param swapFee % fee charged on every swap
 * @param adminFee % of swapFee sent to Saddle
 */
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

/**
 * @notice Deploys a metaswap pool for each given PoolData element that has not yet been deployed.
 * Deploys associated metaswapDeposit and metaswap LP tokens and saves these deployments.
 * Attempts to verify all contracts, adds any non-registered pools to pool registry.
 * When run on local hardhat environment checks for token deployments and mints test tokens.
 * @param pools array of metaswap pool deployment argument objects
 * @param registerNewPools if true, will add any new pools to the pool registry
 */
export async function deployMetaswapPools(
  hre: HardhatRuntimeEnvironment,
  pools: PoolData[],
  registerNewPools = true,
) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()
  // check tokens
  pools.map(async (pool) => await checkTokens(hre, pool.tokenArgs))
  // filter out already deployed pools
  const newDeploypools = await checkIfPoolDeployed(hre, pools)
  for (let i = 0; i < newDeploypools.length; i++) {
    const pool = newDeploypools[i]
    const metaPoolName = pool.poolName
    const basePoolName = pool.basePoolName

    // If meta pool name is null or empty string, throw error
    if (!metaPoolName || metaPoolName === "") {
      throw new Error("Meta pool name is null or empty string")
    }

    // If base pool name is null or empty string, throw error
    if (!basePoolName || basePoolName === "") {
      throw new Error("Base pool name is null or empty string")
    }

    const tokenNames: string[] = []
    for (const token in pool.tokenArgs) {
      tokenNames.push(token)
    }
    tokenNames.push(`${basePoolName}LPToken`)
    const lpTokenName = `${metaPoolName}LPToken`
    const lpTokenSymbol = pool.lpTokenSymbol
    const initialA = pool.initialA
    const swapFee = pool.swapFee
    const adminFee = pool.adminFee

    console.log(`Attempting to deploy pool with name: ${metaPoolName}`)

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
        await get(basePoolName)
      ).address,
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

    if (pool.multisig) {
      await execute(
        metaPoolName,
        { from: deployer, log: true },
        "transferOwnership",
        MULTISIG_ADDRESSES[await getChainId()],
      )
    }

    // deploy the Meta Swap Deposit
    console.log("Deploying Metaswap Deposit")
    const metaswapDepositDeployment = await deployMetaswapDeposit(
      hre,
      `${metaPoolName}Deposit`,
      basePoolName,
      metaPoolName,
    )
    //
    pool.metaswapDeposit = metaswapDepositDeployment?.address

    // If new pools require a gauge deploy
    if (pool.deployGauge) {
      await deployLiquidityGauge(hre, lpTokenName, lpTokenAddress)
    }

    // verify contract
    await verifyContract(hre, metaPoolName)
  }
  // register new pools
  if (registerNewPools && newDeploypools.length > 0) {
    await registerPools(hre, newDeploypools)
  }
}

/**
 * @notice deploys and initializes a single metaswapDeposit, associated with a given
 * metaPool and basePool
 * @param metaPoolDepositName name of the metaSwapDeposit contract to be deployed
 * @param basePoolName the base pool associate with the metaswap
 * @param metaPoolName name of the associated metaswap pool
 */
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
    const metaswapDepositDeployment = await deploy(metaPoolDepositName, {
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
    // verify contract
    await verifyContract(hre, metaPoolDepositName)

    return metaswapDepositDeployment
  }
}

/**
 * @notice deploys a single swapFlashLoan pool, deploying the pool also deploys that pools LP token,
 * saves the LP token deployment.
 * @param poolName name of the swapFlashLoan pool
 * @param tokenNames array of token symbols that are mirrored in deployment folder
 * @param tokenDecimals array of token decimals mirroring token names
 * @param lptokenName name of the LP token to be deployed by the swapFlashLoan
 * @param lpTokenSymbol symbol used for LP token
 * @param initialA initial amplification coefficient
 * @param swapFee % fee charged on every swap
 * @param adminFee % of swapFee sent to Saddle
 */
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

  const TOKEN_ADDRESSES = await Promise.all(
    tokenNames.map(async (name) => (await get(name)).address),
  )
  let tokenDecimalArray = tokenDecimals
  if ((await getChainId()) != CHAIN_ID.AURORA_MAINNET) {
    tokenDecimalArray = await Promise.all(
      tokenNames.map(async (name) => await read(name, "decimals")),
    )
  }
  if (poolContract && isInitialized) {
    log(`reusing ${poolName} at ${poolContract.address}`)
  } else if (poolContract && !isInitialized) {
    await execute(
      poolName,
      {
        from: deployer,
        log: true,
      },
      "initialize",
      TOKEN_ADDRESSES,
      tokenDecimalArray,
      lptokenName,
      lpTokenSymbol,
      initialA,
      swapFee,
      adminFee,
      (
        await get("LPToken")
      ).address,
    )
  } else if (!poolContract && !isInitialized) {
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
      tokenDecimalArray,
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

/**
 * @notice Deploys a swapFlashLoan pool for each given PoolData element that has not yet been deployed.
 * Deploys and saves deployment for the associated LP token.
 * Attempts to verify all contracts, adds any non-registered pools to pool registry.
 * When run on local hardhat environment checks for token deployments and mints test tokens.
 * @param pools array of pool deployment argument objects, basepool should always be empty
 * @param registerNewPools if true, will add any new pools to the pool registry
 */
export async function deploySwapFlashLoanPools(
  hre: HardhatRuntimeEnvironment,
  pools: PoolData[],
  registerNewPools = true,
) {
  const { deployments, getNamedAccounts } = hre
  const { execute, deploy, get, log, read, save } = deployments
  const { deployer } = await getNamedAccounts()
  // check tokens
  pools.map(async (pool) => await checkTokens(hre, pool.tokenArgs))
  // filter out already deployed pools
  const newDeploypools = await checkIfPoolDeployed(hre, pools)
  for (let i = 0; i < newDeploypools.length; i++) {
    const pool = newDeploypools[i]
    const poolName = pool.poolName
    const tokenNames: string[] = []
    for (const token in pool.tokenArgs) {
      tokenNames.push(token)
    }
    const lpTokenName = `${poolName}LPToken`
    const lpTokenSymbol = pool.lpTokenSymbol
    const initialA = pool.initialA
    const swapFee = pool.swapFee
    const adminFee = pool.adminFee
    console.log(`Attempting to deploy pool with name: ${poolName}`)
    const tokenAddresses = await Promise.all(
      tokenNames.map(async (name) => (await get(name)).address),
    )
    const tokenDecimals = await Promise.all(
      tokenNames.map(async (name) => await read(name, "decimals")),
    )
    // deploy the pool
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
    console.log("Deployed")

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

    if (pool.multisig) {
      await execute(
        poolName,
        { from: deployer, log: true },
        "transferOwnership",
        MULTISIG_ADDRESSES[await getChainId()],
      )
    }

    // get lptoken address (was deployed by the metaswap contract)
    const lpTokenAddress = (await read(poolName, "swapStorage")).lpToken
    log(`deployed ${lpTokenName} at ${lpTokenAddress}`)

    // save lptoken deployment
    console.log("saving lp token deployment")
    await save(lpTokenName, {
      abi: (await get("LPToken")).abi, // LPToken ABI
      address: lpTokenAddress,
    })

    // If new pools require a gauge deploy
    if (pool.deployGauge) {
      await deployLiquidityGauge(hre, lpTokenName, lpTokenAddress)
    }

    // verify contracts
    await verifyContract(hre, poolName)
  }

  // register new pools
  if (registerNewPools && newDeploypools.length > 0) {
    await registerPools(hre, newDeploypools)
  }
}

/**
 * @notice deploys a LiquidityV5Gauges for each given swap LPToken element that has not yet been deployed.
 * Deploys and saves deployment for the associated gauge.
 * @param lpToken string of deployed LPToken name
 * @param lpTokenAddress string of deployed LPToken address
 */
export async function deployLiquidityGauge(
  hre: HardhatRuntimeEnvironment,
  lpToken: string,
  lpTokenAddress: string,
) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()
  const gaugeName = `LiquidityGaugeV5_${lpToken}`

  console.log(`Attempting to deploy gauge with name: ${gaugeName}`)
  await deploy(gaugeName, {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "LiquidityGaugeV5",
    args: [
      lpTokenAddress,
      (await get("Minter")).address,
      MULTISIG_ADDRESSES[await getChainId()],
    ],
  })
  console.log(`Successfully deployed gauge with name: ${gaugeName}`)

  // verify contract
  await verifyContract(hre, gaugeName)
}

/**
 * @notice checks if any PoolData objects have not yet been deployed by attempting to read
 * their pool deployment name and swap storage LP token
 * @param PoolData array of pool objects
 */
async function checkIfPoolDeployed(
  hre: HardhatRuntimeEnvironment,
  pools: PoolData[],
) {
  const { deployments } = hre
  const { getOrNull, read } = deployments
  const newDeployPools: PoolData[] = []
  console.log("... checking for new pool deployments")

  for (let i = 0; i < pools.length; i++) {
    const pool = await getOrNull(pools[i].poolName)
    const isInitialized: boolean = pool
      ? (await read(pools[i].poolName, "swapStorage")).lpToken !== ZERO_ADDRESS
      : false
    if (pool && isInitialized) {
      console.log(`reusing ${pools[i].poolName} at ${pool.address}`)
    } else {
      newDeployPools.push(pools[i])
    }
  }
  if (newDeployPools.length != 0) {
    console.log("****** New deployments detected ******")
    for (let i = 0; i < newDeployPools.length; i++) {
      console.log(`New pool to be deployed: ${newDeployPools[i].poolName}`)
    }
  } else {
    console.log("****** No new deployments ******")
  }
  return newDeployPools
}

/**
 * @notice deploys any tokens given in a PoolData object that have not yet been deployed,
 * if run on a local hardhat network mints test tokens
 * @param tokenArgs array token objects containing: deployment name, token name, token symbol, decimals
 */
export async function checkTokens(
  hre: HardhatRuntimeEnvironment,
  tokenArgs: { [token: string]: any[] },
) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute } = deployments
  const { deployer } = await getNamedAccounts()

  for (const token in tokenArgs) {
    await deploy(token, {
      from: deployer,
      log: true,
      contract: "GenericERC20",
      args: tokenArgs[token],
      skipIfAlreadyDeployed: true,
    })
    // If it's on hardhat, mint test tokens
    if (isTestNetwork(await getChainId())) {
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

/**
 * @notice checks the registry for a given registryName
 * @param poolName name of pool to be registered under
 * @returns bool of if the registryName exists in the registry
 */
async function checkRegisteredPool(
  hre: HardhatRuntimeEnvironment,
  registryName: string,
) {
  const { ethers, deployments } = hre
  const { log } = deployments

  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")

  await poolRegistry
    .getPoolDataByName(registryName)
    .then(() => {
      log("Skipping adding pools to registry because they are already added")
      return false
    })
    .catch(async () => {
      return true
    })
}

/**
 * @notice checks the registry for all given registryName then registers any that are
 * not currently registered
 * @param PoolData array of pool argument objects that are being deployed
 */
export async function registerPools(
  hre: HardhatRuntimeEnvironment,
  pools: PoolData[],
) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { execute, get } = deployments
  const { deployer } = await getNamedAccounts()
  const poolRegistry: PoolRegistry = await ethers.getContract("PoolRegistry")
  const poolsToBeAdded = pools.filter((pool) =>
    checkRegisteredPool(hre, pool.registryName?.toString() ?? ""),
  )
  console.log(`Attempting to register ${poolsToBeAdded.length} pool[s]`)
  const poolsToBeRegistered: IPoolRegistry.PoolInputDataStruct[] = []
  await Promise.all(
    poolsToBeAdded.map(async (pool) => {
      if (pool.registryName) {
        poolsToBeRegistered.push({
          poolAddress: (await get(pool.poolName)).address,
          typeOfAsset: PoolType.USD,
          poolName: ethers.utils.formatBytes32String(pool.registryName),
          targetAddress: (await get("SwapFlashLoan")).address,
          metaSwapDepositAddress: pool.metaswapDeposit as string,
          isSaddleApproved: true,
          isRemoved: false,
          isGuarded: false,
        })
      }
    }),
  )
  if (poolsToBeAdded.length > 0) {
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
}

/**
 * @notice attempts to verify given pool argument object
 * @param contractName name of contract to be deployed
 */
export async function verifyContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
) {
  const { ethers } = hre
  const contract = await ethers.getContract(contractName)
  console.log(`attempting to verify contract: ${contractName}`)
  try {
    await hre.run("etherscan-verify", {
      contractName: contractName,
    })
    console.log(`Successfully verified ${contractName} at ${contract.address}`)
  } catch (error) {
    console.log("verification failed with: ", error)
  }
}

/**
 * @notice attempts to transfer ERC20 tokens from set of given addresses to deployer
 * @param hre HardhatRuntimeEnvironment variable
 * @param tokenToWhaleAccountsMap Record of token name (deployment json file name) to
 * array of whale addresses
 * @param receivers array of addresses to receive tokens
 */
export async function stealFundsFromWhales(
  hre: HardhatRuntimeEnvironment,
  tokenToWhaleAccountsMap: Record<string, Address[]>,
  receivers: Address[],
) {
  // Give the deployer tokens from each token holder for testing
  for (const [tokenName, holders] of Object.entries(tokenToWhaleAccountsMap)) {
    const token = (await hre.ethers.getContract(tokenName)) as GenericERC20

    await Promise.all(
      holders.map(async (holder) => {
        // Read the token balance of the whale account
        const balance = await token.balanceOf(holder)
        // Set the token holder eth balance to arbitrary amount
        await setEtherBalance(
          holder,
          hre.ethers.constants.WeiPerEther.mul(1000),
        )
        // Impersonate holder account if needed
        const holderSigner = await impersonateAccount(holder)
        // Transfer tokens to each receiver
        await Promise.all(
          receivers.map(async (receiver) => {
            await token
              .connect(holderSigner)
              .transfer(receiver, balance.div(receivers.length))
            // Log the transfer to the console
            hre.deployments.log(
              `Sent ${hre.ethers.utils.formatUnits(
                balance,
                await token.decimals(),
              )} ${tokenName} from ${holder} to ${receiver}`,
            )
          }),
        )
      }),
    )
  }
}

/**
 * @notice Deploy child chain contracts for cross chain functionalities.
 * Requires nonce 0 ~ 7 on cross chain deployer account to be empty.
 * Note that the ownership of the contracts are set to deployer EOA.
 * So after the deployment is done, the ownerships should be transferred to the
 * appropriate multisig.
 * @param hre HardhatRuntimeEnvironment variable
 */
export async function deployCrossChainSystemOnSideChain(
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts, ethers } = hre
  const { get, execute, deploy, save, rawTx, log, read } = deployments
  const { deployer, crossChainDeployer } = await getNamedAccounts()

  // set owner as deployer until all contracts are deployed
  const owner = deployer

  const xChainFactoryDeployOptions = {
    log: true,
    from: crossChainDeployer,
  }

  const executeOptions = {
    log: true,
    from: deployer,
  }

  // Set eth balance on forked network
  if (process.env.HARDHAT_DEPLOY_FORK) {
    setEtherBalance(crossChainDeployer, ethers.utils.parseEther("10000"))
  }

  const startNonce = await ethers.provider.getTransactionCount(
    crossChainDeployer,
  )
  expect(startNonce).to.eq(
    0,
    `Cross chain deployer nonce is not at 0. Is currently: ${startNonce}`,
  )

  // 0: Deploy ChildGaugeFactory
  const cgf = await deploy("ChildGaugeFactory", {
    ...xChainFactoryDeployOptions,
    args: [
      ZERO_ADDRESS, // AnyCallTranslator placeholder
      (
        await get("SDL")
      ).address, // SDL
      owner, // owner
    ],
  })

  // 1: Placeholder
  const tx = await rawTx({
    ...xChainFactoryDeployOptions,
    to: crossChainDeployer,
    value: "0",
  })
  log(
    `Spending nonce 1 from cross chain deployer: ${tx.transactionHash}: performed with ${tx.gasUsed} gas`,
  )
  expect(await ethers.provider.getTransactionCount(crossChainDeployer)).to.eq(2)

  // 2: Deploy ProxyAdmin to be used as admin of AnyCallTranslator
  const proxyAdmin = await deploy("ProxyAdmin", xChainFactoryDeployOptions)

  // 3: Deploy AnyCallTranslator as a logic contract
  const anyCallTranslatorLogic = await deploy("AnyCallTranslatorLogic", {
    ...xChainFactoryDeployOptions,
    contract: "AnyCallTranslator",
  })

  // Function data for AnyCallTranslator.initialize(multisigAddress, anyCallAddress)
  // This will be passed as 3rd parameter when intiaizing the proxy
  // and gets used as calldata for calling self.delegatecall(initializeCallData)
  const initData = await ethers
    .getContractFactory("AnyCallTranslator")
    .then((c) =>
      c.interface.encodeFunctionData("initialize", [owner, ANYCALL_ADDRESS]),
    )

  // 4: Deploy Proxy to be used as AnyCallTranslator
  const anyCallTranslatorProxy = await deploy("AnyCallTranslatorProxy", {
    ...xChainFactoryDeployOptions,
    contract: "TransparentUpgradeableProxy",
    args: [anyCallTranslatorLogic.address, proxyAdmin.address, initData],
  })
  await save("AnyCallTranslator", {
    abi: anyCallTranslatorLogic.abi,
    address: anyCallTranslatorProxy.address,
  })

  // 5: Deploy child oracle
  const co = await deploy("ChildOracle", {
    ...xChainFactoryDeployOptions,
    args: [anyCallTranslatorProxy.address],
  })

  // 6-10 Need to be skipped
  const currentNonce = await ethers.provider.getTransactionCount(
    crossChainDeployer,
  )
  // If the current nonce is at 8, send an empty tx to bump it untill it reaches 11
  if (currentNonce == 6) {
    for (let i = 0; i < 6; i++) {
      const tx = await rawTx({
        ...xChainFactoryDeployOptions,
        to: crossChainDeployer,
        value: "0",
      })
      log(
        `Spending nonce ${currentNonce + i} from cross chain deployer: ${
          tx.transactionHash
        }: performed with ${tx.gasUsed} gas`,
      )
    }
  }
  expect(await ethers.provider.getTransactionCount(crossChainDeployer)).to.eq(
    11,
  )

  // Deploy updated implementation for ChildGaugeV2

  const cg = await deploy("ChildGaugeV2", {
    contract: "ChildGauge",
    ...xChainFactoryDeployOptions,
    args: [(await get("SDL")).address, cgf.address],
  })
  expect(await read("ChildGaugeV2", "factory")).not.eq(ZERO_ADDRESS)

  // Set up storage variables in child gauge factory from deployer account
  await execute(
    "ChildGaugeFactory",
    executeOptions,
    "set_implementation",
    cg.address,
  )
  await execute(
    "ChildGaugeFactory",
    executeOptions,
    "set_voting_escrow",
    co.address,
  )
  await execute(
    "ChildGaugeFactory",
    executeOptions,
    "set_call_proxy",
    anyCallTranslatorProxy.address,
  )

  // Add to ChildGaugeFactory to master registry
  await execute(
    "MasterRegistry",
    executeOptions,
    "addRegistry",
    ethers.utils.formatBytes32String("ChildGaugeFactory"),
    cgf.address,
  )

  await execute("AnyCallTranslator", executeOptions, "addKnownCallers", [
    cgf.address,
  ])
}

/**
 * @notice Deploy all contracts on a certain chain for permissionless
 * pool deployment functionalities.
 * @param hre HardhatRuntimeEnvironment variable
 */
export async function deployPermissionlessPoolComponents(
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const permissionlessSwap = await getOrNull("PermissionlessSwap")
  const permissionlessMetaSwap = await getOrNull("PermissionlessMetaSwap")
  const permissionlessDeployer = await getOrNull("PermissionlessDeployer")
  const masterRegistry: MasterRegistry = await ethers.getContract(
    "MasterRegistry",
    deployer,
  )
  const masterRegistryAddress = masterRegistry.address
  const swapUtilsAddress = (await get("SwapUtils")).address
  const amplificationUtilsAddress = (await get("AmplificationUtils")).address
  const metaswapDeposit = await getOrNull("MetaPoolDeposit")
  let metaswapDepositAddress = metaswapDeposit?.address
  // see if master registry has a fee collector set
  const feeCollectorName = ethers.utils.formatBytes32String("FeeCollector")

  // skip following txs if permissionless deployer is deployed
  if (permissionlessDeployer) {
    return
  }

  // get multisig address for network, if there is none default to deployer
  let rolesAssignedTo = "multisig"
  let multisig = MULTISIG_ADDRESSES[await getChainId()]
  if (multisig === undefined) {
    console.log("No multisig address found for network, defaulting to deployer")
    multisig = deployer
    rolesAssignedTo = "deployer"
  }

  // Check if deployer has the default admin role
  const deployerHasRole = await masterRegistry.hasRole(
    await masterRegistry.DEFAULT_ADMIN_ROLE(),
    deployer,
  )
  try {
    await masterRegistry.resolveNameToLatestAddress(feeCollectorName)
  } catch (error) {
    console.log(`No fee collector set, attempting to set to ${rolesAssignedTo}`)

    if (deployerHasRole) {
      await execute(
        "MasterRegistry",
        {
          from: deployer,
          log: true,
        },
        "addRegistry",
        feeCollectorName,
        multisig,
      )
    } else {
      console.log(
        `Deployer does not have default admin role, ${rolesAssignedTo} was NOT set as fee collector`,
      )
    }
  }

  // Deploy an instance of MetaSwapDeposit if not found
  if (metaswapDeposit == undefined) {
    console.log("Deploying MetaSwapDeposit")
    const metaSwapDepositDeployment = await deploy("MetaSwapDeposit", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
    metaswapDepositAddress = metaSwapDepositDeployment.address
  }

  // deploy PermissionlessSwap if needed
  if (permissionlessSwap == null) {
    console.log("PermissionlessSwap not found, deploying")
    await deploy("PermissionlessSwap", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: swapUtilsAddress,
        AmplificationUtils: amplificationUtilsAddress,
      },
    })
  }
  const permissionlessSwapAddress = (await get("PermissionlessSwap")).address

  // deploy PermissionlessMetaSwap if needed
  if (permissionlessMetaSwap == null) {
    console.log("PermissionlessMetaSwap not found, deploying")
    await deploy("PermissionlessMetaSwap", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: swapUtilsAddress,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: amplificationUtilsAddress,
      },
    })
  }
  const permissionlessMetaSwapAddress = (await get("PermissionlessMetaSwap"))
    .address

  // deploy PermissionlessDeployer
  if (permissionlessDeployer == null) {
    console.log("PermissionlessDeployer not found, deploying")

    const PermissionlessDeployerDeployment = await deploy(
      "PermissionlessDeployer",
      {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: true,
        args: [
          multisig, // admin
          masterRegistryAddress, // masterRegistry
          (
            await get("LPToken")
          ).address, // targetLPToken
          permissionlessSwapAddress, // targetSwap
          permissionlessMetaSwapAddress, // targetMetaSwap
          // Below needs to be a non-clone instance of the MetaswapDeposit Contract
          metaswapDepositAddress, // targetMetaSwapDeposit
        ],
      },
    )
    console.log(
      "PermissionlessDeployer deployed at",
      PermissionlessDeployerDeployment.address,
    )

    // PermissionlessDeployer to the master registry if the deployer can

    if (deployerHasRole) {
      console.log("Adding PermissionlessDeployer to MasterRegistry")
      await execute(
        "MasterRegistry",
        {
          from: deployer,
          log: true,
        },
        "addRegistry",
        ethers.utils.formatBytes32String("PermissionlessDeployer"),
        PermissionlessDeployerDeployment.address,
      )
    } else {
      console.log(
        "PermissionlessDeployer not added to MasterRegistry, multisig tx required",
      )
    }
  }
  console.log("All permissionless contracts deployed :)")
}

/**
 * @notice Deploy all contracts on a certain chain for permissionless
 * pool deployment functionalities, with updated contract versions.
 * @param hre HardhatRuntimeEnvironment variable
 */
export async function deployPermissionlessPoolComponentsV2(
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const permissionlessSwap = await getOrNull("PermissionlessSwapV1")
  const permissionlessMetaSwap = await getOrNull("PermissionlessMetaSwapV1")
  const permissionlessDeployer = await getOrNull("PermissionlessDeployer")
  const masterRegistry: MasterRegistry = await ethers.getContract(
    "MasterRegistry",
    deployer,
  )
  const masterRegistryAddress = masterRegistry.address
  const swapUtilsAddress = (await get("SwapUtilsV2")).address
  const amplificationUtilsAddress = (await get("AmplificationUtilsV2")).address
  const metaSwapUtilsAddress = (await get("MetaSwapUtilsV1")).address
  const metaswapDeposit = await getOrNull("MetaPoolDepositV1")
  let metaswapDepositAddress = metaswapDeposit?.address
  // see if master registry has a fee collector set
  const feeCollectorName = ethers.utils.formatBytes32String("FeeCollector")

  // skip following txs if permissionless deployer is deployed
  if (permissionlessDeployer) {
    return
  }

  // get multisig address for network, if there is none default to deployer
  let rolesAssignedTo = "multisig"
  let multisig = MULTISIG_ADDRESSES[await getChainId()]
  if (multisig === undefined) {
    console.log("No multisig address found for network, defaulting to deployer")
    multisig = deployer
    rolesAssignedTo = "deployer"
  }

  // Check if deployer has the default admin role
  const deployerHasRole = await masterRegistry.hasRole(
    await masterRegistry.DEFAULT_ADMIN_ROLE(),
    deployer,
  )
  try {
    await masterRegistry.resolveNameToLatestAddress(feeCollectorName)
  } catch (error) {
    console.log(`No fee collector set, attempting to set to ${rolesAssignedTo}`)

    if (deployerHasRole) {
      await execute(
        "MasterRegistry",
        {
          from: deployer,
          log: true,
        },
        "addRegistry",
        feeCollectorName,
        multisig,
      )
    } else {
      console.log(
        `Deployer does not have default admin role, ${rolesAssignedTo} was NOT set as fee collector`,
      )
    }
  }

  // Deploy an instance of MetaSwapDeposit if not found
  if (metaswapDeposit == undefined) {
    console.log("Deploying MetaSwapDeposit")
    const metaSwapDepositDeployment = await deploy("MetaSwapDepositV1", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
    metaswapDepositAddress = metaSwapDepositDeployment.address
  }

  // deploy PermissionlessSwap if needed
  if (permissionlessSwap == null) {
    console.log("PermissionlessSwap not found, deploying")
    await deploy("PermissionlessSwapV1", {
      contract: "PermissionlessSwap",
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: swapUtilsAddress,
        AmplificationUtils: amplificationUtilsAddress,
      },
    })
  }
  const permissionlessSwapAddress = (await get("PermissionlessSwapV1")).address

  // deploy PermissionlessMetaSwap if needed
  if (permissionlessMetaSwap == null) {
    console.log("PermissionlessMetaSwap not found, deploying")
    await deploy("PermissionlessMetaSwapV1", {
      contract: "PermissionlessMetaSwap",
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [masterRegistryAddress],
      libraries: {
        SwapUtils: swapUtilsAddress,
        MetaSwapUtils: metaSwapUtilsAddress,
        AmplificationUtils: amplificationUtilsAddress,
      },
    })
  }
  const permissionlessMetaSwapAddress = (await get("PermissionlessMetaSwapV1"))
    .address

  // deploy PermissionlessDeployer
  if (permissionlessDeployer == null) {
    console.log("PermissionlessDeployer not found, deploying")

    const PermissionlessDeployerDeployment = await deploy(
      "PermissionlessDeployer",
      {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: true,
        args: [
          multisig, // admin
          masterRegistryAddress, // masterRegistry
          (
            await get("LPTokenV2")
          ).address, // targetLPToken
          permissionlessSwapAddress, // targetSwap
          permissionlessMetaSwapAddress, // targetMetaSwap
          // Below needs to be a non-clone instance of the MetaswapDeposit Contract
          metaswapDepositAddress, // targetMetaSwapDeposit
        ],
      },
    )
    console.log(
      "PermissionlessDeployer deployed at",
      PermissionlessDeployerDeployment.address,
    )

    // PermissionlessDeployer to the master registry if the deployer can

    if (deployerHasRole) {
      console.log("Adding PermissionlessDeployer to MasterRegistry")
      await execute(
        "MasterRegistry",
        {
          from: deployer,
          log: true,
        },
        "addRegistry",
        ethers.utils.formatBytes32String("PermissionlessDeployer"),
        PermissionlessDeployerDeployment.address,
      )
    } else {
      console.log(
        "PermissionlessDeployer not added to MasterRegistry, multisig tx required",
      )
    }
  }
  console.log("All permissionless contracts deployed :)")
}

/**
 * @notice Deploy child gauges for given record of lp token name to registry name
 * @param {HardhatRuntimeEnvironment} hre HardhatRuntimeEnvironment
 * @param {Record<string, string>} lpTokenNameToRegistryName Record of lp token name to registry name
 * @param {boolean} isMirrored if true, makes additional call per gauge to set mirrored to true
 */
export async function deployChildGauges(
  hre: HardhatRuntimeEnvironment,
  lpTokenNameToRegistryName: Record<string, string>,
  isMirrored: boolean,
) {
  const { deployments, getNamedAccounts } = hre
  const { get, execute, save } = deployments
  const { deployer } = await getNamedAccounts()

  const executeOptions = {
    log: true,
    from: deployer,
  }

  for (const lpTokenName in lpTokenNameToRegistryName) {
    const lpTokenRegistryName = lpTokenNameToRegistryName[lpTokenName]
    const lpToken = await get(lpTokenName)

    // Broadcast the transaction
    const tx = await execute(
      "ChildGaugeFactory",
      executeOptions,
      "deploy_gauge(address,bytes32,string)",
      lpToken.address,
      convertGaugeNameToSalt(lpTokenRegistryName),
      lpTokenRegistryName,
    )

    // Find the deployed gauge address from the event logs
    const gaugeAddress: string = tx.events?.find(
      (e) => e.event === "DeployedGauge",
    )?.args?._gauge

    // Save the info to the deployment json folder
    await save(`ChildGauge_${lpTokenName}`, {
      abi: (await get("ChildGauge")).abi,
      address: gaugeAddress,
    })

    // Set the child gauge as mirrored if needed
    if (isMirrored)
      await execute(
        "ChildGaugeFactory",
        executeOptions,
        "set_mirrored",
        gaugeAddress,
        true,
      )
  }
}
