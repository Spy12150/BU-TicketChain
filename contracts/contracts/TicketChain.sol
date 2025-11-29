// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TicketChain
 * @dev ERC-1155 based ticketing system for university events
 * 
 * Each eventId corresponds to a unique ticket type. Users can buy, transfer,
 * and refund tickets. Admins can create events and manage discount eligibility.
 */
contract TicketChain is ERC1155, Ownable, ReentrancyGuard {
    // ============ Structs ============
    
    struct EventInfo {
        uint256 id;
        string name;
        uint256 price;              // Price in wei
        uint256 discountedPrice;    // Discounted price for eligible users
        uint256 maxSupply;
        uint256 totalSold;
        uint256 startTime;          // Unix timestamp when event starts
        uint256 endTime;            // Unix timestamp when event ends
        bool exists;
    }

    // ============ State Variables ============

    /// @dev Mapping from eventId to EventInfo
    mapping(uint256 => EventInfo) public events;
    
    /// @dev Mapping from address to discount eligibility (e.g., BU students/faculty)
    mapping(address => bool) public discountEligible;
    
    /// @dev Mapping from eventId => user address => number of tickets owned
    /// Note: This is redundant with ERC1155 balanceOf but useful for quick lookups
    mapping(uint256 => mapping(address => uint256)) public ticketsByUser;
    
    /// @dev Counter for generating unique event IDs
    uint256 public nextEventId;
    
    /// @dev Mapping to track if a specific ticket has been used (for verification)
    /// Format: eventId => ticketSerial => used
    mapping(uint256 => mapping(uint256 => bool)) public ticketUsed;
    
    /// @dev Mapping to track the next serial number for each event
    mapping(uint256 => uint256) public nextTicketSerial;

    // ============ Events ============

    event EventCreated(
        uint256 indexed eventId,
        string name,
        uint256 price,
        uint256 discountedPrice,
        uint256 maxSupply,
        uint256 startTime,
        uint256 endTime
    );

    event TicketPurchased(
        uint256 indexed eventId,
        address indexed buyer,
        uint256 pricePaid,
        uint256 ticketSerial,
        uint256 quantity
    );

    event TicketTransferred(
        uint256 indexed eventId,
        address indexed from,
        address indexed to,
        uint256 quantity
    );

    event TicketRefunded(
        uint256 indexed eventId,
        address indexed holder,
        uint256 refundAmount,
        uint256 quantity
    );

    event DiscountEligibilitySet(
        address indexed user,
        bool eligible
    );

    event TicketMarkedUsed(
        uint256 indexed eventId,
        uint256 indexed ticketSerial,
        address indexed holder
    );

    // ============ Modifiers ============

    modifier eventExists(uint256 eventId) {
        require(events[eventId].exists, "Event does not exist");
        _;
    }

    // ============ Constructor ============

    constructor() ERC1155("") Ownable(msg.sender) {
        nextEventId = 1; // Start event IDs at 1
    }

    // ============ Admin Functions ============

    /**
     * @dev Creates a new event. Only callable by the contract owner (admin).
     * @param name The name of the event
     * @param price The regular ticket price in wei
     * @param discountedPrice The discounted price for eligible users
     * @param maxSupply Maximum number of tickets available
     * @param startTime Unix timestamp when the event starts
     * @param endTime Unix timestamp when the event ends
     * @return eventId The ID of the newly created event
     */
    function createEvent(
        string calldata name,
        uint256 price,
        uint256 discountedPrice,
        uint256 maxSupply,
        uint256 startTime,
        uint256 endTime
    ) external onlyOwner returns (uint256 eventId) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(maxSupply > 0, "Max supply must be > 0");
        require(startTime < endTime, "Start time must be before end time");
        require(discountedPrice <= price, "Discounted price cannot exceed regular price");

        eventId = nextEventId++;
        
        events[eventId] = EventInfo({
            id: eventId,
            name: name,
            price: price,
            discountedPrice: discountedPrice,
            maxSupply: maxSupply,
            totalSold: 0,
            startTime: startTime,
            endTime: endTime,
            exists: true
        });

        emit EventCreated(
            eventId,
            name,
            price,
            discountedPrice,
            maxSupply,
            startTime,
            endTime
        );

        return eventId;
    }

    /**
     * @dev Sets discount eligibility for an address. Only callable by owner.
     * @param user The address to set eligibility for
     * @param eligible Whether the user is eligible for discounts
     */
    function setDiscountEligibility(address user, bool eligible) external onlyOwner {
        require(user != address(0), "Invalid address");
        discountEligible[user] = eligible;
        emit DiscountEligibilitySet(user, eligible);
    }

    /**
     * @dev Batch set discount eligibility for multiple addresses.
     * @param users Array of addresses
     * @param eligible Whether these users are eligible for discounts
     */
    function setDiscountEligibilityBatch(
        address[] calldata users,
        bool eligible
    ) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            require(users[i] != address(0), "Invalid address in batch");
            discountEligible[users[i]] = eligible;
            emit DiscountEligibilitySet(users[i], eligible);
        }
    }

    // ============ User Functions ============

    /**
     * @dev Buy a ticket for an event. Payment is atomic with minting.
     * @param eventId The ID of the event to buy a ticket for
     */
    function buyTicket(uint256 eventId) external payable nonReentrant eventExists(eventId) {
        EventInfo storage eventInfo = events[eventId];
        
        // Check time window - can only buy before the event ends
        require(block.timestamp < eventInfo.endTime, "Event has ended");
        
        // Check supply
        require(eventInfo.totalSold < eventInfo.maxSupply, "Event sold out");
        
        // Calculate price
        uint256 ticketPrice = getTicketPrice(eventId, msg.sender);
        require(msg.value >= ticketPrice, "Insufficient payment");
        
        // Mint the ticket
        uint256 ticketSerial = nextTicketSerial[eventId]++;
        eventInfo.totalSold++;
        ticketsByUser[eventId][msg.sender]++;
        
        _mint(msg.sender, eventId, 1, "");
        
        // Refund excess payment
        if (msg.value > ticketPrice) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - ticketPrice}("");
            require(refundSuccess, "Refund failed");
        }
        
        emit TicketPurchased(eventId, msg.sender, ticketPrice, ticketSerial, 1);
    }

    /**
     * @dev Transfer a ticket to another address.
     * Uses ERC1155 safeTransferFrom internally.
     * @param eventId The event ID
     * @param to The recipient address
     * @param quantity Number of tickets to transfer
     */
    function transferTicket(
        uint256 eventId,
        address to,
        uint256 quantity
    ) external nonReentrant eventExists(eventId) {
        require(to != address(0), "Cannot transfer to zero address");
        require(to != msg.sender, "Cannot transfer to self");
        require(balanceOf(msg.sender, eventId) >= quantity, "Insufficient tickets");
        
        ticketsByUser[eventId][msg.sender] -= quantity;
        ticketsByUser[eventId][to] += quantity;
        
        safeTransferFrom(msg.sender, to, eventId, quantity, "");
        
        emit TicketTransferred(eventId, msg.sender, to, quantity);
    }

    /**
     * @dev Refund a ticket before the event starts.
     * Burns the ticket and returns the original payment.
     * @param eventId The event ID to refund
     */
    function refundTicket(uint256 eventId) external nonReentrant eventExists(eventId) {
        EventInfo storage eventInfo = events[eventId];
        
        // Can only refund before event starts
        require(block.timestamp < eventInfo.startTime, "Cannot refund after event starts");
        require(balanceOf(msg.sender, eventId) >= 1, "No tickets to refund");
        
        // Calculate refund amount (use the price the user would pay now)
        // In a production system, you'd want to track the actual price paid
        uint256 refundAmount = getTicketPrice(eventId, msg.sender);
        
        // Burn the ticket
        _burn(msg.sender, eventId, 1);
        eventInfo.totalSold--;
        ticketsByUser[eventId][msg.sender]--;
        
        // Send refund
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund transfer failed");
        
        emit TicketRefunded(eventId, msg.sender, refundAmount, 1);
    }

    // ============ Verifier Functions ============

    /**
     * @dev Mark a ticket as used (for venue entry verification).
     * Only the ticket holder can mark their ticket as used.
     * @param eventId The event ID
     * @param ticketSerial The specific ticket serial number
     */
    function markTicketUsed(
        uint256 eventId,
        uint256 ticketSerial
    ) external eventExists(eventId) {
        require(balanceOf(msg.sender, eventId) >= 1, "Not a ticket holder");
        require(!ticketUsed[eventId][ticketSerial], "Ticket already used");
        
        ticketUsed[eventId][ticketSerial] = true;
        
        emit TicketMarkedUsed(eventId, ticketSerial, msg.sender);
    }

    // ============ View Functions ============

    /**
     * @dev Get the ticket price for a user (considers discount eligibility).
     * @param eventId The event ID
     * @param user The user address
     * @return The ticket price in wei
     */
    function getTicketPrice(uint256 eventId, address user) public view returns (uint256) {
        EventInfo storage eventInfo = events[eventId];
        if (discountEligible[user]) {
            return eventInfo.discountedPrice;
        }
        return eventInfo.price;
    }

    /**
     * @dev Get full event information.
     * @param eventId The event ID
     * @return The EventInfo struct
     */
    function getEvent(uint256 eventId) external view returns (EventInfo memory) {
        require(events[eventId].exists, "Event does not exist");
        return events[eventId];
    }

    /**
     * @dev Check remaining ticket supply for an event.
     * @param eventId The event ID
     * @return remaining Number of tickets still available
     */
    function getRemainingSupply(uint256 eventId) external view eventExists(eventId) returns (uint256 remaining) {
        EventInfo storage eventInfo = events[eventId];
        return eventInfo.maxSupply - eventInfo.totalSold;
    }

    /**
     * @dev Check if a ticket is valid and unused.
     * @param eventId The event ID
     * @param ticketSerial The ticket serial number
     * @param holder The address claiming to hold the ticket
     * @return valid Whether the ticket is valid
     * @return used Whether the ticket has been used
     * @return holderBalance How many tickets of this event the holder owns
     */
    function verifyTicket(
        uint256 eventId,
        uint256 ticketSerial,
        address holder
    ) external view returns (bool valid, bool used, uint256 holderBalance) {
        if (!events[eventId].exists) {
            return (false, false, 0);
        }
        
        holderBalance = balanceOf(holder, eventId);
        used = ticketUsed[eventId][ticketSerial];
        valid = holderBalance > 0 && !used;
        
        return (valid, used, holderBalance);
    }

    // ============ Admin Withdrawal ============

    /**
     * @dev Withdraw contract balance to owner. Only callable by owner.
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    // ============ Receive Function ============

    /// @dev Allow contract to receive ETH
    receive() external payable {}
}

