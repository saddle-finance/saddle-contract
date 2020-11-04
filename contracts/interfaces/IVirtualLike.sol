pragma solidity 0.5.17;

interface IVirtualLike {
    function readyToSettle() external view returns (bool);
    function settle(address account) external;
}