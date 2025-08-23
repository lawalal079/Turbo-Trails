// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TurboToken
 * @dev ERC-20 token for Turbo Trails game with minting capabilities
 * Supply is not capped but managed through minting and token sinks
 */
contract TurboToken is ERC20, Ownable {
    // Mapping to track authorized minters (game contracts)
    mapping(address => bool) public authorizedMinters;
    
    // Events
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TokensBurned(address indexed from, uint256 amount);
    
    constructor() ERC20("Turbo Token", "TURBO") {
        // Initial supply to owner for testing/initial distribution
        _mint(msg.sender, 1000000 * 10**decimals());
    }
    
    /**
     * @dev Add an authorized minter (typically game contracts)
     */
    function addMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev Remove an authorized minter
     */
    function removeMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev Mint tokens to a player (only authorized minters)
     */
    function mint(address to, uint256 amount) external {
        require(authorizedMinters[msg.sender], "Not authorized to mint");
        _mint(to, amount);
    }

    /**
     * @dev Owner-only mint function for administrative/testing purposes
     */
    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @dev Burn tokens (token sink mechanism)
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
    
    /**
     * @dev Burn tokens from a specific address (with approval)
     */
    function burnFrom(address from, uint256 amount) external {
        uint256 currentAllowance = allowance(from, msg.sender);
        require(currentAllowance >= amount, "Burn amount exceeds allowance");
        
        _approve(from, msg.sender, currentAllowance - amount);
        _burn(from, amount);
        emit TokensBurned(from, amount);
    }
}
