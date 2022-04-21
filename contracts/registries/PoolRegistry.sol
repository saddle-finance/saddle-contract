// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../helper/BaseBoringBatchable.sol";
import "../interfaces/ISwap.sol";
import "../interfaces/ISwapGuarded.sol";
import "../interfaces/IMetaSwap.sol";
import "../interfaces/IPoolRegistry.sol";
import "../meta/MetaSwapDeposit.sol";

/**
 * @title PoolRegistry
 * @notice This contract holds list of pools deployed.
 */
contract PoolRegistry is
    AccessControl,
    ReentrancyGuard,
    BaseBoringBatchable,
    IPoolRegistry
{
    using SafeMath for uint256;

    /// @notice Role responsible for managing pools.
    bytes32 public constant SADDLE_MANAGER_ROLE =
        keccak256("SADDLE_MANAGER_ROLE");
    /// @notice Role responsible for managing community pools
    bytes32 public constant COMMUNITY_MANAGER_ROLE =
        keccak256("COMMUNITY_MANAGER_ROLE");
    /// @notice Role that represents approved owners of pools.
    /// owner of each pool must have this role if the pool is to be approved.
    bytes32 public constant SADDLE_APPROVED_POOL_OWNER_ROLE =
        keccak256("SADDLE_APPROVED_POOL_OWNER_ROLE");

    /// @inheritdoc IPoolRegistry
    mapping(address => uint256) public override poolsIndexOfPlusOne;
    /// @inheritdoc IPoolRegistry
    mapping(bytes32 => uint256) public override poolsIndexOfNamePlusOne;

    PoolData[] private pools;
    mapping(uint256 => address[]) private eligiblePairsMap;

    /**
     * @notice Add a new registry entry to the master list.
     * @param poolAddress address of the added pool
     * @param index index of the added pool in the pools list
     * @param poolData added pool data
     */
    event AddPool(
        address indexed poolAddress,
        uint256 index,
        PoolData poolData
    );

    /**
     * @notice Add a new registry entry to the master list.
     * @param poolAddress address of the added pool
     * @param index index of the added pool in the pools list
     * @param poolData added pool data
     */
    event AddCommunityPool(
        address indexed poolAddress,
        uint256 index,
        PoolData poolData
    );

    /**
     * @notice Add a new registry entry to the master list.
     * @param poolAddress address of the updated pool
     * @param index index of the updated pool in the pools list
     * @param poolData updated pool data
     */
    event UpdatePool(
        address indexed poolAddress,
        uint256 index,
        PoolData poolData
    );

    /**
     * @notice Add a new registry entry to the master list.
     * @param poolAddress address of the removed pool
     * @param index index of the removed pool in the pools list
     */
    event RemovePool(address indexed poolAddress, uint256 index);

    /**
     * @notice Deploy this contract and set appropriate roles
     * @param admin address who should have the DEFAULT_ADMIN_ROLE
     * @dev caller of this function will be set as the owner on deployment
     */
    constructor(address admin, address poolOwner) public payable {
        require(admin != address(0), "admin == 0");
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(SADDLE_MANAGER_ROLE, msg.sender);
        _setupRole(SADDLE_APPROVED_POOL_OWNER_ROLE, poolOwner);
    }

    /// @inheritdoc IPoolRegistry
    function addCommunityPool(PoolData memory data) external payable override {
        require(
            hasRole(COMMUNITY_MANAGER_ROLE, msg.sender),
            "PR: Only managers can add pools"
        );

        // Check token addresses
        for (uint8 i = 0; i < data.tokens.length; i++) {
            for (uint8 j = 0; j < i; j++) {
                eligiblePairsMap[
                    uint160(address(data.tokens[i])) ^
                        uint160(address(data.tokens[j]))
                ].push(data.poolAddress);
            }
        }

        // Check meta swap deposit address
        if (data.metaSwapDepositAddress != address(0)) {
            for (uint8 i = 0; i < data.underlyingTokens.length; i++) {
                // add combinations of tokens to eligible pairs map
                // i reprents the indexes of the underlying tokens of metaLPToken.
                // j represents the indexes of MetaSwap level tokens that are not metaLPToken.
                // Example: tokens = [sUSD, baseLPToken]
                //         underlyingTokens = [sUSD, DAI, USDC, USDT]
                // i represents index of [DAI, USDC, USDT] in underlyingTokens
                // j represents index of [sUSD] in underlyingTokens
                if (i > data.tokens.length.sub(2))
                    for (uint256 j = 0; j < data.tokens.length - 1; j++) {
                        eligiblePairsMap[
                            uint160(address(data.underlyingTokens[i])) ^
                                uint160(address(data.underlyingTokens[j]))
                        ].push(data.metaSwapDepositAddress);
                    }
            }
        }

        pools.push(data);
        poolsIndexOfPlusOne[data.poolAddress] = pools.length;
        poolsIndexOfNamePlusOne[data.poolName] = pools.length;

        emit AddCommunityPool(data.poolAddress, pools.length - 1, data);
    }

    /// @inheritdoc IPoolRegistry
    function addPool(PoolInputData memory inputData)
        external
        payable
        override
        nonReentrant
    {
        require(
            hasRole(SADDLE_MANAGER_ROLE, msg.sender),
            "PR: Only managers can add pools"
        );
        require(inputData.poolAddress != address(0), "PR: poolAddress is 0");
        require(
            poolsIndexOfPlusOne[inputData.poolAddress] == 0,
            "PR: Pool is already added"
        );

        IERC20[] memory tokens = new IERC20[](8);
        IERC20[] memory underlyingTokens = new IERC20[](8);

        PoolData memory data = PoolData(
            inputData.poolAddress,
            address(0),
            inputData.typeOfAsset,
            inputData.poolName,
            inputData.targetAddress,
            tokens,
            underlyingTokens,
            address(0),
            inputData.metaSwapDepositAddress,
            inputData.isSaddleApproved,
            inputData.isRemoved,
            inputData.isGuarded
        );

        // Get lp token address
        data.lpToken = inputData.isGuarded
            ? _getSwapStorageGuarded(inputData.poolAddress).lpToken
            : _getSwapStorage(inputData.poolAddress).lpToken;

        // Check token addresses
        for (uint8 i = 0; i < 8; i++) {
            try ISwap(inputData.poolAddress).getToken(i) returns (
                IERC20 token
            ) {
                require(address(token) != address(0), "PR: token is 0");
                tokens[i] = token;
                // add combinations of tokens to eligible pairs map
                for (uint8 j = 0; j < i; j++) {
                    eligiblePairsMap[
                        uint160(address(tokens[i])) ^
                            uint160(address(tokens[j]))
                    ].push(inputData.poolAddress);
                }
            } catch {
                assembly {
                    mstore(tokens, sub(mload(tokens), sub(8, i)))
                }
                break;
            }
        }

        // Check meta swap deposit address
        if (inputData.metaSwapDepositAddress != address(0)) {
            // Get base pool address
            data.basePoolAddress = address(
                MetaSwapDeposit(inputData.metaSwapDepositAddress).baseSwap()
            );
            require(
                poolsIndexOfPlusOne[data.basePoolAddress] > 0,
                "PR: base pool not found"
            );

            // Get underlying tokens
            for (uint8 i = 0; i < 8; i++) {
                try
                    MetaSwapDeposit(inputData.metaSwapDepositAddress).getToken(
                        i
                    )
                returns (IERC20 token) {
                    require(address(token) != address(0), "PR: token is 0");
                    underlyingTokens[i] = token;
                    // add combinations of tokens to eligible pairs map
                    // i reprents the indexes of the underlying tokens of metaLPToken.
                    // j represents the indexes of MetaSwap level tokens that are not metaLPToken.
                    // Example: tokens = [sUSD, baseLPToken]
                    //         underlyingTokens = [sUSD, DAI, USDC, USDT]
                    // i represents index of [DAI, USDC, USDT] in underlyingTokens
                    // j represents index of [sUSD] in underlyingTokens
                    if (i > tokens.length.sub(2))
                        for (uint256 j = 0; j < tokens.length - 1; j++) {
                            eligiblePairsMap[
                                uint160(address(underlyingTokens[i])) ^
                                    uint160(address(underlyingTokens[j]))
                            ].push(inputData.metaSwapDepositAddress);
                        }
                } catch {
                    assembly {
                        mstore(
                            underlyingTokens,
                            sub(mload(underlyingTokens), sub(8, i))
                        )
                    }
                    break;
                }
            }
            require(
                address(
                    MetaSwapDeposit(inputData.metaSwapDepositAddress).metaSwap()
                ) == inputData.poolAddress,
                "PR: metaSwap address mismatch"
            );
        } else {
            assembly {
                mstore(underlyingTokens, sub(mload(underlyingTokens), 8))
            }
        }

        pools.push(data);
        poolsIndexOfPlusOne[data.poolAddress] = pools.length;
        poolsIndexOfNamePlusOne[data.poolName] = pools.length;

        emit AddPool(inputData.poolAddress, pools.length - 1, data);
    }

    /// @inheritdoc IPoolRegistry
    function approvePool(address poolAddress)
        external
        payable
        override
        managerOnly
    {
        uint256 poolIndex = poolsIndexOfPlusOne[poolAddress];
        require(poolIndex > 0, "PR: Pool not found");

        PoolData storage poolData = pools[poolIndex];

        require(
            poolData.poolAddress == poolAddress,
            "PR: poolAddress mismatch"
        );

        // Effect
        poolData.isSaddleApproved = true;

        // Interaction
        require(
            hasRole(
                SADDLE_APPROVED_POOL_OWNER_ROLE,
                ISwap(poolAddress).owner()
            ),
            "Pool is not owned by saddle"
        );

        emit UpdatePool(poolAddress, poolIndex, poolData);
    }

    /// @inheritdoc IPoolRegistry
    function updatePool(PoolData memory poolData)
        external
        payable
        override
        managerOnly
    {
        uint256 poolIndex = poolsIndexOfPlusOne[poolData.poolAddress];
        require(poolIndex > 0, "PR: Pool not found");
        poolIndex -= 1;

        pools[poolIndex] = poolData;

        emit UpdatePool(poolData.poolAddress, poolIndex, poolData);
    }

    /// @inheritdoc IPoolRegistry
    function removePool(address poolAddress)
        external
        payable
        override
        managerOnly
    {
        uint256 poolIndex = poolsIndexOfPlusOne[poolAddress];
        require(poolIndex > 0, "PR: Pool not found");
        poolIndex -= 1;

        pools[poolIndex].isRemoved = true;

        emit RemovePool(poolAddress, poolIndex);
    }

    /// @inheritdoc IPoolRegistry
    function getPoolDataAtIndex(uint256 index)
        external
        view
        override
        returns (PoolData memory)
    {
        require(index < pools.length, "PR: Index out of bounds");
        return pools[index];
    }

    /// @inheritdoc IPoolRegistry
    function getPoolData(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (PoolData memory)
    {
        return pools[poolsIndexOfPlusOne[poolAddress] - 1];
    }

    /// @inheritdoc IPoolRegistry
    function getPoolDataByName(bytes32 poolName)
        external
        view
        override
        returns (PoolData memory)
    {
        uint256 index = poolsIndexOfNamePlusOne[poolName];
        require(index > 0, "PR: Pool not found");
        return pools[index - 1];
    }

    modifier hasMatchingPool(address poolAddress) {
        require(
            poolsIndexOfPlusOne[poolAddress] > 0,
            "PR: No matching pool found"
        );
        _;
    }

    modifier managerOnly() {
        require(
            hasRole(SADDLE_MANAGER_ROLE, msg.sender),
            "PR: Caller is not saddle manager"
        );
        _;
    }

    /// @inheritdoc IPoolRegistry
    function getVirtualPrice(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (uint256)
    {
        return ISwap(poolAddress).getVirtualPrice();
    }

    /// @inheritdoc IPoolRegistry
    function getA(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (uint256)
    {
        return ISwap(poolAddress).getA();
    }

    /// @inheritdoc IPoolRegistry
    function getPaused(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (bool)
    {
        return ISwap(poolAddress).paused();
    }

    /// @inheritdoc IPoolRegistry
    function getSwapStorage(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (SwapStorageData memory swapStorageData)
    {
        swapStorageData = pools[poolsIndexOfPlusOne[poolAddress] - 1].isGuarded
            ? _getSwapStorageGuarded(poolAddress)
            : _getSwapStorage(poolAddress);
    }

    function _getSwapStorage(address poolAddress)
        internal
        view
        returns (SwapStorageData memory swapStorageData)
    {
        (
            swapStorageData.initialA,
            swapStorageData.futureA,
            swapStorageData.initialATime,
            swapStorageData.futureATime,
            swapStorageData.swapFee,
            swapStorageData.adminFee,
            swapStorageData.lpToken
        ) = ISwap(poolAddress).swapStorage();
    }

    function _getSwapStorageGuarded(address poolAddress)
        internal
        view
        returns (SwapStorageData memory swapStorageData)
    {
        (
            swapStorageData.initialA,
            swapStorageData.futureA,
            swapStorageData.initialATime,
            swapStorageData.futureATime,
            swapStorageData.swapFee,
            swapStorageData.adminFee,
            ,
            swapStorageData.lpToken
        ) = ISwapGuarded(poolAddress).swapStorage();
    }

    /// @inheritdoc IPoolRegistry
    function getTokens(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (IERC20[] memory tokens)
    {
        return pools[poolsIndexOfPlusOne[poolAddress] - 1].tokens;
    }

    /// @inheritdoc IPoolRegistry
    function getUnderlyingTokens(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (IERC20[] memory underlyingTokens)
    {
        return pools[poolsIndexOfPlusOne[poolAddress] - 1].underlyingTokens;
    }

    /// @inheritdoc IPoolRegistry
    function getPoolsLength() external view override returns (uint256) {
        return pools.length;
    }

    /// @inheritdoc IPoolRegistry
    function getEligiblePools(address from, address to)
        external
        view
        override
        returns (address[] memory eligiblePools)
    {
        require(
            from != address(0) && from != to,
            "PR: from and to cannot be the zero address"
        );
        return eligiblePairsMap[uint160(from) ^ uint160(to)];
    }

    /// @inheritdoc IPoolRegistry
    function getTokenBalances(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (uint256[] memory balances)
    {
        return _getTokenBalances(poolAddress);
    }

    function _getTokenBalances(address poolAddress)
        internal
        view
        returns (uint256[] memory balances)
    {
        uint256 tokensLength = pools[poolsIndexOfPlusOne[poolAddress] - 1]
            .tokens
            .length;
        balances = new uint256[](tokensLength);
        for (uint8 i = 0; i < tokensLength; i++) {
            balances[i] = ISwap(poolAddress).getTokenBalance(i);
        }
    }

    /// @inheritdoc IPoolRegistry
    function getUnderlyingTokenBalances(address poolAddress)
        external
        view
        override
        hasMatchingPool(poolAddress)
        returns (uint256[] memory balances)
    {
        uint256 poolIndex = poolsIndexOfPlusOne[poolAddress] - 1;
        address basePoolAddress = pools[poolIndex].basePoolAddress;
        uint256[] memory basePoolBalances = _getTokenBalances(basePoolAddress);
        uint256 underlyingTokensLength = pools[poolIndex]
            .underlyingTokens
            .length;
        uint256 metaLPTokenIndex = underlyingTokensLength -
            basePoolBalances.length;
        uint256 baseLPTokenBalance = ISwap(poolAddress).getTokenBalance(
            uint8(metaLPTokenIndex)
        );
        uint256 baseLPTokenTotalSupply = LPToken(
            pools[poolsIndexOfPlusOne[basePoolAddress] - 1].lpToken
        ).totalSupply();

        balances = new uint256[](underlyingTokensLength);
        for (uint8 i = 0; i < metaLPTokenIndex; i++) {
            balances[i] = ISwap(poolAddress).getTokenBalance(i);
        }
        for (uint256 i = metaLPTokenIndex; i < underlyingTokensLength; i++) {
            balances[i] = basePoolBalances[i - metaLPTokenIndex]
                .mul(baseLPTokenBalance)
                .div(baseLPTokenTotalSupply);
        }
    }
}
