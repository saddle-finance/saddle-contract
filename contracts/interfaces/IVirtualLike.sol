pragma solidity 0.6.12;

interface IVirtualLike {
    function readyToSettle() external view returns (bool);

    function settled() external view returns (bool);

    function settle(address account) external;
}
