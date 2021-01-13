pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "./interfaces/IAllowlist.sol";

/**
 * @title Allowlist
 * @notice This contract is a registry holding information about how much each swap contract should
 * contain upto. Swap.sol will rely on this contract to determine whether the pool cap is reached and
 * also whether a user's deposit limit is reached.
 */
contract Allowlist is Ownable, IAllowlist {
    using SafeMath for uint256;

    // Represents the root node of merkle tree containing a list of eligible addresses
    bytes32 public merkleRoot;
    // Maps pool address -> maximum total supply
    mapping(address => uint256) private poolCaps;
    // Maps pool address -> maximum amount of pool token mintable per account
    mapping(address => uint256) private accountLimits;

    event PoolCap(address indexed poolAddress, uint256 poolCap);
    event PoolAccountLimit(address indexed poolAddress, uint256 accountLimit);
    event NewMerkleRoot(bytes32 merkleRoot);

    /**
     * @notice Creates this contract and sets PoolCap of 0x0 with uint256(0x54dd1e) for
     * crude checking whether an address holds this contract
     * @param merkleRoot_ bytes32 that represent merkle root node. This is generated off chain with the list of
     * qualifying addresses
     */
    constructor(bytes32 merkleRoot_) public {
        merkleRoot = merkleRoot_;

        // This value will be used as a way of crude checking whether an address holds this Allowlist contract
        // Value 0x54dd1e has no inherent meaning other than it is arbitrary value that checks for
        // user error.
        poolCaps[address(0x0)] = uint256(0x54dd1e);
        emit PoolCap(address(0x0), uint256(0x54dd1e));
        emit NewMerkleRoot(merkleRoot_);
    }

    /**
     * @notice Returns the max mintable amount of lp token per account in given pool address.
     * Pools should use this function to check against user's lpToken balance in addLiquidity function.
     * @param poolAddress address of the pool
     * @return max mintable amount of lp token per account
     */
    function getPoolAccountLimit(address poolAddress)
        external
        view
        override
        returns (uint256)
    {
        return accountLimits[poolAddress];
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

    /**
     * @notice Checks existence of keccak256(index, account) as a node in merkle tree stored in this contract.
     * Pools should use this function to check if the given address qualify for depositing
     * @param account address to confirm its existence - this would be user address
     * @param merkleProof data that is used to prove the existence of given parameters. This is generated
     * during creation of the merkle tree. Users should retrieve this data off chain.
     * @return boolean value that corresponds to whether the address is found in the merkle tree
     */
    function verifyAddress(address account, bytes32[] calldata merkleProof)
        external
        view
        override
        returns (bool)
    {
        // Verify the account exists in the merkle tree via MerkleProof library
        bytes32 node = keccak256(abi.encodePacked(account));
        return MerkleProof.verify(merkleProof, merkleRoot, node);
    }

    // ADMIN FUNCTIONS

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

    /**
     * @notice Updates merkle root that is stored in this contract. This can only be called by
     * the owner. If more addresses are added to the allowlist, new merkle tree should be generated
     * and merkleRoot should be updated accordingly.
     * @param merkleRoot_ new merkle root node that contains list of deposit allowed addresses
     */
    function updateMerkleRoot(bytes32 merkleRoot_) external onlyOwner {
        merkleRoot = merkleRoot_;
        emit NewMerkleRoot(merkleRoot_);
    }
}
