// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import "forge-std/Script.sol";

contract JsonFormatter is Script {
    /**
     * @dev Format keys and values into a json string
     */
    function format(string[] memory keys, string[] memory values)
        public
        returns (string memory)
    {
        require(keys.length == values.length, "invalid length");
        string memory json = "{";
        for (uint256 i = 0; i < keys.length; ) {
            json = string.concat(json, '"', keys[i], '":', values[i]);
            if (++i != keys.length) {
                json = string.concat(json, ",");
            }
        }
        json = string.concat(json, "}");
        return json;
    }

    /**
     * @dev Format array of values into a json string
     */
    function formatArrayString(string[] memory values)
        public
        returns (string memory)
    {
        string memory json = "[";
        for (uint256 i = 0; i < values.length; ) {
            json = string.concat(json, values[i]);
            if (++i != values.length) {
                json = string.concat(json, ",");
            }
        }
        json = string.concat(json, "]");
        return json;
    }

    /**
     * @dev Format array of uint256 into a json string
     */
    function formatArrayString(uint256[] memory values)
        public
        returns (string memory)
    {
        string memory json = "[";
        for (uint256 i = 0; i < values.length; ) {
            json = string.concat(json, vm.toString(values[i]));
            if (++i != values.length) {
                json = string.concat(json, ",");
            }
        }
        json = string.concat(json, "]");
        return json;
    }

    /**
     * @dev Format array of addresses into a json string
     */
    function formatArrayString(address[] memory values)
        public
        returns (string memory)
    {
        string memory json = "[";
        for (uint256 i = 0; i < values.length; ) {
            json = string.concat(json, '"', vm.toString(values[i]), '"');
            if (++i != values.length) {
                json = string.concat(json, ",");
            }
        }
        json = string.concat(json, "]");
        return json;
    }
}
