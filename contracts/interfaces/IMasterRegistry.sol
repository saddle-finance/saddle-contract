// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

interface IMasterRegistry {
    /* Structs */

    struct ReverseRegistryData {
        bytes32 name;
        uint256 version;
    }

    /* Functions */

    /**
     * @notice Add a new registry entry to the master list.
     * @param registryName name for the registry
     * @param registryAddress address of the new registry
     */
    function addRegistry(bytes32 registryName, address registryAddress)
        external
        payable;

    /**
     * @notice Resolves a name to the latest registry address. Reverts if no match is found.
     * @param name name for the registry
     * @return address address of the latest registry with the matching name
     */
    function resolveNameToLatestAddress(bytes32 name)
        external
        view
        returns (address);

    /**
     * @notice Resolves a name and version to an address. Reverts if there is no registry with given name and version.
     * @param name address of the registry you want to resolve to
     * @param version version of the registry you want to resolve to
     */
    function resolveNameAndVersionToAddress(bytes32 name, uint256 version)
        external
        view
        returns (address);

    /**
     * @notice Resolves a name to an array of all addresses. Reverts if no match is found.
     * @param name name for the registry
     * @return address address of the latest registry with the matching name
     */
    function resolveNameToAllAddresses(bytes32 name)
        external
        view
        returns (address[] memory);

    /**
     * @notice Resolves an address to registry entry data.
     * @param registryAddress address of a registry you want to resolve
     * @return name name of the resolved registry
     * @return version version of the resolved registry
     * @return isLatest boolean flag of whether the given address is the latest version of the given registries with
     * matching name
     */
    function resolveAddressToRegistryData(address registryAddress)
        external
        view
        returns (
            bytes32 name,
            uint256 version,
            bool isLatest
        );
}
