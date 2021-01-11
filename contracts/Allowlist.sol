pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IAllowlist.sol";

/**
 * @title Allowlist
 * @notice This contract is a registry holding information about how much each swap contract should
 * contain upto. Swap.sol will rely on this contract to determine whether the pool cap is reached and
 * also whether a user's deposit limit is reached.
 */
contract Allowlist is Ownable, IAllowlist {
    using SafeMath for uint256;

    // Multiplier will be divided by this denominator
    uint256 public constant DENOMINATOR = 1e3;

    // Maps user address -> multiplier that will increase or decrease maximum amount of pool token
    // mintable for that user address.
    // Since multipliers will be divided by the DENOMINATOR, setting it to 1000 is effectively
    // 1.0x multiplier.
    mapping(address => uint256) private multipliers;
    // Maps pool address -> maximum total supply
    mapping(address => uint256) private poolCaps;
    // Maps pool address -> maximum amount of pool token mintable per account
    mapping(address => uint256) private accountLimits;

    event SetMultipliers(address[] addressArray, uint256[] multiplierArray);
    event PoolCap(address indexed poolAddress, uint256 poolCap);
    event PoolAccountLimit(address indexed poolAddress, uint256 accountLimit);

    /**
     * @notice Creates this contract and sets PoolCap of 0x0 with uint256(0x54dd1e) for
     * crude checking whether an address holds this contract
     */
    constructor() public {
        // This value will be used as a way of crude checking whether an address holds this Allowlist contract
        // Value 0x54dd1e has no inherent meaning other than it is arbitrary value that checks for
        // user error.
        poolCaps[address(0x0)] = uint256(0x54dd1e);
        emit PoolCap(address(0x0), uint256(0x54dd1e));
    }

    /**
     * @notice Returns stored allowed amount for the user at the given pool address.
     * @param poolAddress address of the pool
     * @param user address of the user
     */
    function getAllowedAmount(address poolAddress, address user)
        external
        view
        override
        returns (uint256)
    {
        return
            accountLimits[poolAddress].mul(multipliers[user]).div(DENOMINATOR);
    }

    /**
     * @notice Returns maximum total supply of pool token for given pool address.
     * @param poolAddress address of the pool
     */
    function getPoolCap(address poolAddress)
        external
        view
        override
        returns (uint256)
    {
        return poolCaps[poolAddress];
    }

    // ADMIN FUNCTIONS

    /**
     * @notice Set multipliers for given addresses
     * @param addressArray array of addresses
     * @param multiplierArray array of multipliers for respective addresses
     *        (multiplier set to 1000 equals 1.000x)
     */
    function setMultipliers(
        address[] calldata addressArray,
        uint256[] calldata multiplierArray
    ) external onlyOwner {
        require(
            addressArray.length == multiplierArray.length,
            "Array lengths are different"
        );

        for (uint256 i = 0; i < multiplierArray.length; i++) {
            multipliers[addressArray[i]] = multiplierArray[i];
        }

        emit SetMultipliers(addressArray, multiplierArray);
    }

    /**
     * @notice Set account limit of allowed deposit amounts for the given pool
     * @param poolAddress address of the pool
     * @param accountLimit base amount to be used for calculating allowed amounts of each user
     */
    function setPoolAccountLimit(address poolAddress, uint256 accountLimit)
        external
        onlyOwner
    {
        require(poolAddress != address(0x0), "0x0 is not a pool address");
        accountLimits[poolAddress] = accountLimit;
        emit PoolAccountLimit(poolAddress, accountLimit);
    }

    /**
     * @notice Set the max number of pool token minted for given pool address
     * @param poolAddress address of the pool
     * @param poolCap total value cap amount - limits the totalSupply of the pool token
     */
    function setPoolCap(address poolAddress, uint256 poolCap)
        external
        onlyOwner
    {
        require(poolAddress != address(0x0), "0x0 is not a pool address");
        poolCaps[poolAddress] = poolCap;
        emit PoolCap(poolAddress, poolCap);
    }
}
