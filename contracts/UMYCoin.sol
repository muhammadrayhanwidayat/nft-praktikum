// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UMYCoin is ERC20, Ownable {

    constructor(uint256 initialSupply) ERC20("UMYCoin", "UMYC") {
        _mint(msg.sender, initialSupply);
    }

    // Optional: fungsi mint tambahan (hanya owner)
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}