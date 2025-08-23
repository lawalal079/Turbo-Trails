// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./TurboToken.sol";

/**
 * @dev Monad Games ID contract interface (must be top-level, not nested inside a contract)
 */
interface IMonadGamesID {
    function submitScore(address player, uint256 score) external;
    function getLeaderboard() external view returns (address[] memory players, uint256[] memory scores);
    function getPlayerScore(address player) external view returns (uint256);
    // Mission team requirement: insert player data on leaderboard
    function updatePlayerData(address player, uint256 score, uint256 tokensEarned) external;
}

/**
 * @title GameIntermediary
 * @dev Intermediary contract that handles game logic and interfaces with Monad Games ID
 */
contract GameIntermediary {
    
    // Game item structure
    struct GameItem {
        string name;
        uint256 price;
        uint8 itemType; // 0: single-use, 1: permanent upgrade, 2: bike upgrade
        bool isActive;
        // Item effects
        uint256 speedBoost;
        uint256 gripBoost;
        uint256 armorBoost;
        uint256 nitroBoost;
    }
    
    // Player inventory structure
    struct PlayerInventory {
        mapping(uint256 => uint256) itemCounts; // itemId => count
        mapping(uint256 => bool) permanentItems; // itemId => owned
        uint256 bikeLevel;
        uint256 totalSpent;
    }
    
    // State variables
    TurboToken public turboToken;
    IMonadGamesID public monadGamesID;
    address public owner;
    address public gameServer; // Authorized server for score submission
    address public treasury; // Treasury wallet for gasless purchases
    
    // Game data
    mapping(address => PlayerInventory) public playerInventories;
    mapping(uint256 => GameItem) public gameItems;
    mapping(address => mapping(address => uint256)) public raceBets; // player => opponent => bet amount
    
    uint256 public nextItemId = 1;
    uint256 public constant SCORE_TO_TOKEN_RATIO = 10; // 1 score = 10 TURBO tokens
    
    // Events
    event ScoreSubmitted(address indexed player, uint256 score, uint256 tokensEarned);
    event PlayerDataUpdated(address indexed player, uint256 score, uint256 tokensEarned);
    event ItemPurchased(address indexed player, uint256 itemId, uint256 price);
    event RaceBetPlaced(address indexed player, address indexed opponent, uint256 amount);
    event RaceBetSettled(address indexed winner, address indexed loser, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
    
    modifier onlyGameServer() {
        require(msg.sender == gameServer, "Not authorized game server");
        _;
    }
    
    constructor(address _turboToken, address _monadGamesID) {
        turboToken = TurboToken(_turboToken);
        monadGamesID = IMonadGamesID(_monadGamesID);
        owner = msg.sender;
        
        // Initialize default game items
        _createDefaultItems();
    }
    
    /**
     * @dev Set the authorized game server address
     */
    function setGameServer(address _gameServer) external onlyOwner {
        gameServer = _gameServer;
    }
    
    /**
     * @dev Set the treasury wallet used to fund gasless purchases
     */
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
    
    /**
     * @dev Submit score and mint tokens (called by game server)
     */
    function submitScoreAndMintTokens(address player, uint256 score) external onlyGameServer {
        // Submit score to Monad Games ID contract
        monadGamesID.submitScore(player, score);
        
        // Calculate and mint tokens
        uint256 tokensToMint = score * SCORE_TO_TOKEN_RATIO;
        turboToken.mint(player, tokensToMint);
        
        emit ScoreSubmitted(player, score, tokensToMint);
        // Also update leaderboard/player data as requested by mission team
        monadGamesID.updatePlayerData(player, score, tokensToMint);
        emit PlayerDataUpdated(player, score, tokensToMint);
    }
    
    /**
     * @dev Purchase an item from the shop
     */
    function purchaseItem(uint256 itemId, uint256 quantity) external {
        GameItem storage item = gameItems[itemId];
        require(item.isActive, "Item not available");
        
        uint256 totalCost = item.price * quantity;
        require(turboToken.balanceOf(msg.sender) >= totalCost, "Insufficient TURBO tokens");
        
        // Burn tokens (token sink)
        turboToken.burnFrom(msg.sender, totalCost);
        
        PlayerInventory storage inventory = playerInventories[msg.sender];
        
        if (item.itemType == 0) {
            // Single-use item
            inventory.itemCounts[itemId] += quantity;
        } else {
            // Permanent upgrade or bike upgrade
            inventory.permanentItems[itemId] = true;
            if (item.itemType == 2) {
                inventory.bikeLevel++;
            }
        }
        
        inventory.totalSpent += totalCost;
        
        emit ItemPurchased(msg.sender, itemId, totalCost);
    }
    
    /**
     * @dev Gasless purchase: burn cost from treasury and credit items to player (called by game server)
     */
    function purchaseItemFor(address player, uint256 itemId, uint256 quantity) external onlyGameServer {
        require(player != address(0), "Invalid player");
        require(quantity > 0, "Invalid quantity");
        require(treasury != address(0), "Treasury not set");
        
        GameItem storage item = gameItems[itemId];
        require(item.isActive, "Item not available");
        
        uint256 totalCost = item.price * quantity;
        require(turboToken.balanceOf(treasury) >= totalCost, "Treasury insufficient TURBO");
        require(turboToken.allowance(treasury, address(this)) >= totalCost, "Treasury allowance too low");
        
        // Burn tokens from treasury (token sink)
        turboToken.burnFrom(treasury, totalCost);
        
        PlayerInventory storage inventory = playerInventories[player];
        
        if (item.itemType == 0) {
            // Single-use item
            inventory.itemCounts[itemId] += quantity;
        } else {
            // Permanent upgrade or bike upgrade
            inventory.permanentItems[itemId] = true;
            if (item.itemType == 2) {
                inventory.bikeLevel++;
            }
        }
        
        inventory.totalSpent += totalCost;
        
        emit ItemPurchased(player, itemId, totalCost);
    }
    
    /**
     * @dev Place a bet for a race
     */
    function placeBet(address opponent, uint256 amount) external {
        require(turboToken.balanceOf(msg.sender) >= amount, "Insufficient TURBO tokens");
        require(opponent != msg.sender, "Cannot bet against yourself");
        
        // Lock the bet amount
        turboToken.burnFrom(msg.sender, amount);
        raceBets[msg.sender][opponent] = amount;
        
        emit RaceBetPlaced(msg.sender, opponent, amount);
    }
    
    /**
     * @dev Settle race bet (called by game server)
     */
    function settleRaceBet(address winner, address loser) external onlyGameServer {
        uint256 winnerBet = raceBets[winner][loser];
        uint256 loserBet = raceBets[loser][winner];
        
        require(winnerBet > 0 || loserBet > 0, "No active bet");
        
        uint256 totalPot = winnerBet + loserBet;
        if (totalPot > 0) {
            // Winner takes all
            turboToken.mint(winner, totalPot);
        }
        
        // Clear bets
        raceBets[winner][loser] = 0;
        raceBets[loser][winner] = 0;
        
        emit RaceBetSettled(winner, loser, totalPot);
    }
    
    /**
     * @dev Get player's inventory
     */
    function getPlayerInventory(address player) external view returns (
        uint256[] memory itemIds,
        uint256[] memory counts,
        bool[] memory permanentItems,
        uint256 bikeLevel
    ) {
        PlayerInventory storage inventory = playerInventories[player];
        
        // Count items
        uint256 itemCount = 0;
        for (uint256 i = 1; i < nextItemId; i++) {
            if (inventory.itemCounts[i] > 0 || inventory.permanentItems[i]) {
                itemCount++;
            }
        }
        
        itemIds = new uint256[](itemCount);
        counts = new uint256[](itemCount);
        permanentItems = new bool[](itemCount);
        
        uint256 index = 0;
        for (uint256 i = 1; i < nextItemId; i++) {
            if (inventory.itemCounts[i] > 0 || inventory.permanentItems[i]) {
                itemIds[index] = i;
                counts[index] = inventory.itemCounts[i];
                permanentItems[index] = inventory.permanentItems[i];
                index++;
            }
        }
        
        bikeLevel = inventory.bikeLevel;
    }
    
    /**
     * @dev Create a new game item (owner only)
     */
    function createItem(
        string memory name,
        uint256 price,
        uint8 itemType,
        uint256 speedBoost,
        uint256 gripBoost,
        uint256 armorBoost,
        uint256 nitroBoost
    ) external onlyOwner {
        gameItems[nextItemId] = GameItem({
            name: name,
            price: price,
            itemType: itemType,
            isActive: true,
            speedBoost: speedBoost,
            gripBoost: gripBoost,
            armorBoost: armorBoost,
            nitroBoost: nitroBoost
        });
        nextItemId++;
    }
    
    /**
     * @dev Initialize default game items
     */
    function _createDefaultItems() internal {
        // Single-use items
        gameItems[1] = GameItem("Nitro Boost", 100, 0, true, 0, 0, 0, 50);
        gameItems[2] = GameItem("Shield Bubble", 150, 0, true, 0, 0, 30, 0);
        
        // Permanent upgrades
        gameItems[3] = GameItem("Grip Tires", 500, 1, true, 0, 25, 0, 0);
        gameItems[4] = GameItem("Armor Plate", 750, 1, true, 0, 0, 40, 0);
        gameItems[5] = GameItem("Turbo Engine", 1000, 1, true, 30, 0, 0, 0);
        
        // Bike upgrades
        gameItems[6] = GameItem("Bike Upgrade Tier 1", 2000, 2, true, 20, 15, 20, 10);
        
        nextItemId = 7;
    }
}
