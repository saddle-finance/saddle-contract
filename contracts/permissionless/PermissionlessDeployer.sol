// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../interfaces/ISwap.sol";
import "../interfaces/IMetaSwap.sol";
import "../interfaces/IMetaSwapDeposit.sol";
import "../interfaces/IPoolRegistry.sol";
import "../interfaces/IMasterRegistry.sol";

/**
 * @title PermissionlessDeployer
 */
contract PermissionlessDeployer is AccessControl {
    IMasterRegistry public immutable MASTER_REGISTRY;
    bytes32 public constant POOL_REGISTRY_NAME =
        0x506f6f6c52656769737472790000000000000000000000000000000000000000;

    /// @notice Role responsible for managing target addresses
    bytes32 public constant SADDLE_MANAGER_ROLE =
        keccak256("SADDLE_MANAGER_ROLE");

    address public targetLPToken;
    address public targetSwap;
    address public targetMetaSwap;
    address public targetMetaSwapDeposit;

    IPoolRegistry public poolRegistryCached;

    event NewSwapPool(
        address indexed deployer,
        address swapAddress,
        IERC20[] pooledTokens
    );
    event NewClone(address indexed target, address cloneAddress);
    event PoolRegistryUpdated(address indexed poolRegistry);
    event TargetLPTokenUpdated(address indexed target);
    event TargetSwapUpdated(address indexed target);
    event TargetMetaSwapUpdated(address indexed target);
    event TargetMetaSwapDepositUpdated(address indexed target);

    struct DeploySwapInput {
        bytes32 poolName;
        IERC20[] tokens;
        uint8[] decimals;
        string lpTokenName;
        string lpTokenSymbol;
        uint256 a;
        uint256 fee;
        uint256 adminFee;
        address owner;
        uint8 typeOfAsset;
    }

    struct DeployMetaSwapInput {
        bytes32 poolName;
        IERC20[] tokens;
        uint8[] decimals;
        string lpTokenName;
        string lpTokenSymbol;
        uint256 a;
        uint256 fee;
        uint256 adminFee;
        address baseSwap;
        address owner;
        uint8 typeOfAsset;
    }

    constructor(
        address admin,
        address _masterRegistry,
        address _targetLPToken,
        address _targetSwap,
        address _targetMetaSwap,
        address _targetMetaSwapDeposit
    ) public payable {
        require(admin != address(0), "admin == 0");
        require(_masterRegistry != address(0), "masterRegistry == 0");

        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(SADDLE_MANAGER_ROLE, msg.sender);

        _setTargetLPToken(_targetLPToken);
        _setTargetSwap(_targetSwap);
        _setTargetMetaSwap(_targetMetaSwap);
        _setTargetMetaSwapDeposit(_targetMetaSwapDeposit);

        MASTER_REGISTRY = IMasterRegistry(_masterRegistry);
        _updatePoolRegistryCache(_masterRegistry);
    }

    modifier onlyManager() {
        require(hasRole(SADDLE_MANAGER_ROLE, msg.sender), "only manager");
        _;
    }

    function clone(address target) public payable returns (address newClone) {
        newClone = Clones.clone(target);
        emit NewClone(target, newClone);
    }

    function deploySwap(DeploySwapInput memory input)
        external
        payable
        returns (address deployedSwap)
    {
        address swapClone = clone(targetSwap);

        ISwap(swapClone).initialize(
            input.tokens,
            input.decimals,
            input.lpTokenName,
            input.lpTokenSymbol,
            input.a,
            input.fee,
            input.adminFee,
            targetLPToken
        );
        Ownable(swapClone).transferOwnership(input.owner);
        (, , , , , , address lpToken) = ISwap(swapClone).swapStorage();

        IPoolRegistry.PoolData memory poolData = IPoolRegistry.PoolData({
            poolAddress: swapClone,
            lpToken: lpToken,
            typeOfAsset: input.typeOfAsset,
            poolName: input.poolName,
            targetAddress: targetSwap,
            tokens: input.tokens,
            underlyingTokens: new IERC20[](0),
            basePoolAddress: address(0),
            metaSwapDepositAddress: address(0),
            isSaddleApproved: false,
            isRemoved: false,
            isGuarded: false
        });

        emit NewSwapPool(msg.sender, swapClone, input.tokens);

        poolRegistryCached.addCommunityPool(poolData);
        return swapClone;
    }

    function deployMetaSwap(DeployMetaSwapInput memory input)
        external
        payable
        returns (address deployedMetaSwap, address deployedMetaSwapDeposit)
    {
        deployedMetaSwap = clone(targetMetaSwap);
        IMetaSwap(deployedMetaSwap).initializeMetaSwap(
            input.tokens,
            input.decimals,
            input.lpTokenName,
            input.lpTokenSymbol,
            input.a,
            input.fee,
            input.adminFee,
            targetLPToken,
            ISwap(input.baseSwap)
        );
        (, , , , , , address lpToken) = ISwap(deployedMetaSwap).swapStorage();
        Ownable(deployedMetaSwap).transferOwnership(input.owner);

        deployedMetaSwapDeposit = clone(targetMetaSwapDeposit);
        IMetaSwapDeposit(deployedMetaSwapDeposit).initialize(
            ISwap(input.baseSwap),
            IMetaSwap(deployedMetaSwap),
            IERC20(lpToken)
        );

        IERC20[] memory baseTokens = poolRegistryCached.getTokens(
            input.baseSwap
        ); // revert if baseSwap is not registered
        IERC20[] memory underlyingTokens = new IERC20[](
            input.tokens.length - 1 + baseTokens.length
        );
        uint256 metaLPTokenIndex = input.tokens.length - 1;
        for (uint256 i = 0; i < metaLPTokenIndex; i++) {
            underlyingTokens[i] = input.tokens[i];
        }
        for (uint256 i = metaLPTokenIndex; i < underlyingTokens.length; i++) {
            underlyingTokens[i] = baseTokens[i - metaLPTokenIndex];
        }

        IPoolRegistry.PoolData memory poolData = IPoolRegistry.PoolData({
            poolAddress: deployedMetaSwap,
            lpToken: lpToken,
            typeOfAsset: input.typeOfAsset,
            poolName: input.poolName,
            targetAddress: targetSwap,
            tokens: input.tokens,
            underlyingTokens: underlyingTokens,
            basePoolAddress: input.baseSwap,
            metaSwapDepositAddress: deployedMetaSwapDeposit,
            isSaddleApproved: false,
            isRemoved: false,
            isGuarded: false
        });

        emit NewSwapPool(msg.sender, deployedMetaSwap, input.tokens);
        emit NewSwapPool(msg.sender, deployedMetaSwapDeposit, underlyingTokens);

        poolRegistryCached.addCommunityPool(poolData);
    }

    function updatePoolRegistryCache() external {
        _updatePoolRegistryCache(address(MASTER_REGISTRY));
    }

    function _updatePoolRegistryCache(address masterRegistry) internal {
        poolRegistryCached = IPoolRegistry(
            IMasterRegistry(masterRegistry).resolveNameToLatestAddress(
                POOL_REGISTRY_NAME
            )
        );
    }

    function setTargetLPToken(address _targetLPToken)
        external
        payable
        onlyManager
    {
        _setTargetLPToken(_targetLPToken);
    }

    function _setTargetLPToken(address _targetLPToken) internal {
        require(
            address(_targetLPToken) != address(0),
            "Target LPToken cannot be 0"
        );
        targetLPToken = _targetLPToken;
    }

    function setTargetSwap(address _targetSwap) external payable onlyManager {
        _setTargetSwap(_targetSwap);
    }

    function _setTargetSwap(address _targetSwap) internal {
        require(address(_targetSwap) != address(0), "Target Swap cannot be 0");
        targetSwap = _targetSwap;
        emit TargetSwapUpdated(_targetSwap);
    }

    function setTargetMetaSwap(address _targetMetaSwap)
        public
        payable
        onlyManager
    {
        _setTargetMetaSwap(_targetMetaSwap);
    }

    function _setTargetMetaSwap(address _targetMetaSwap) internal {
        require(
            address(_targetMetaSwap) != address(0),
            "Target MetaSwap cannot be 0"
        );
        targetMetaSwap = _targetMetaSwap;
        emit TargetMetaSwapUpdated(_targetMetaSwap);
    }

    function setTargetMetaSwapDeposit(address _targetMetaSwapDeposit)
        external
        payable
        onlyManager
    {
        _setTargetMetaSwapDeposit(_targetMetaSwapDeposit);
    }

    function _setTargetMetaSwapDeposit(address _targetMetaSwapDeposit)
        internal
    {
        require(
            address(_targetMetaSwapDeposit) != address(0),
            "Target MetaSwapDeposit cannot be 0"
        );
        targetMetaSwapDeposit = _targetMetaSwapDeposit;
        emit TargetMetaSwapDepositUpdated(_targetMetaSwapDeposit);
    }
}
