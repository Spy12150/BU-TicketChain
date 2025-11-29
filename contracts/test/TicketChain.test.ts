import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TicketChain } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TicketChain", function () {
  // Fixture to deploy contract and set up test accounts
  async function deployTicketChainFixture() {
    const [owner, user1, user2, verifier] = await ethers.getSigners();

    const TicketChain = await ethers.getContractFactory("TicketChain");
    const ticketChain = await TicketChain.deploy();

    // Time helpers
    const now = await time.latest();
    const oneWeek = 7 * 24 * 60 * 60;
    const startTime = now + oneWeek;
    const endTime = now + 2 * oneWeek;

    // Prices
    const regularPrice = ethers.parseEther("0.1");
    const discountedPrice = ethers.parseEther("0.05");

    return {
      ticketChain,
      owner,
      user1,
      user2,
      verifier,
      startTime,
      endTime,
      regularPrice,
      discountedPrice,
    };
  }

  // Fixture with a pre-created event
  async function deployWithEventFixture() {
    const fixture = await deployTicketChainFixture();
    const { ticketChain, regularPrice, discountedPrice, startTime, endTime } = fixture;

    await ticketChain.createEvent(
      "Test Event",
      regularPrice,
      discountedPrice,
      100, // max supply
      startTime,
      endTime
    );

    return { ...fixture, eventId: 1n };
  }

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      const { ticketChain, owner } = await loadFixture(deployTicketChainFixture);
      expect(await ticketChain.owner()).to.equal(owner.address);
    });

    it("Should start with nextEventId = 1", async function () {
      const { ticketChain } = await loadFixture(deployTicketChainFixture);
      expect(await ticketChain.nextEventId()).to.equal(1);
    });
  });

  describe("Event Creation", function () {
    it("Should create an event with correct parameters", async function () {
      const { ticketChain, regularPrice, discountedPrice, startTime, endTime } =
        await loadFixture(deployTicketChainFixture);

      await expect(
        ticketChain.createEvent(
          "BU Concert",
          regularPrice,
          discountedPrice,
          500,
          startTime,
          endTime
        )
      )
        .to.emit(ticketChain, "EventCreated")
        .withArgs(1, "BU Concert", regularPrice, discountedPrice, 500, startTime, endTime);

      const eventInfo = await ticketChain.getEvent(1);
      expect(eventInfo.name).to.equal("BU Concert");
      expect(eventInfo.price).to.equal(regularPrice);
      expect(eventInfo.discountedPrice).to.equal(discountedPrice);
      expect(eventInfo.maxSupply).to.equal(500);
      expect(eventInfo.totalSold).to.equal(0);
    });

    it("Should reject event creation from non-owner", async function () {
      const { ticketChain, user1, regularPrice, discountedPrice, startTime, endTime } =
        await loadFixture(deployTicketChainFixture);

      await expect(
        ticketChain.connect(user1).createEvent(
          "Unauthorized Event",
          regularPrice,
          discountedPrice,
          100,
          startTime,
          endTime
        )
      ).to.be.revertedWithCustomError(ticketChain, "OwnableUnauthorizedAccount");
    });

    it("Should reject event with empty name", async function () {
      const { ticketChain, regularPrice, discountedPrice, startTime, endTime } =
        await loadFixture(deployTicketChainFixture);

      await expect(
        ticketChain.createEvent("", regularPrice, discountedPrice, 100, startTime, endTime)
      ).to.be.revertedWith("Name cannot be empty");
    });

    it("Should reject event with zero max supply", async function () {
      const { ticketChain, regularPrice, discountedPrice, startTime, endTime } =
        await loadFixture(deployTicketChainFixture);

      await expect(
        ticketChain.createEvent("Event", regularPrice, discountedPrice, 0, startTime, endTime)
      ).to.be.revertedWith("Max supply must be > 0");
    });

    it("Should reject event where discounted price exceeds regular price", async function () {
      const { ticketChain, regularPrice, startTime, endTime } =
        await loadFixture(deployTicketChainFixture);

      const invalidDiscount = regularPrice + ethers.parseEther("0.01");
      await expect(
        ticketChain.createEvent("Event", regularPrice, invalidDiscount, 100, startTime, endTime)
      ).to.be.revertedWith("Discounted price cannot exceed regular price");
    });
  });

  describe("Discount Eligibility", function () {
    it("Should set discount eligibility for a user", async function () {
      const { ticketChain, user1 } = await loadFixture(deployTicketChainFixture);

      await expect(ticketChain.setDiscountEligibility(user1.address, true))
        .to.emit(ticketChain, "DiscountEligibilitySet")
        .withArgs(user1.address, true);

      expect(await ticketChain.discountEligible(user1.address)).to.be.true;
    });

    it("Should set discount eligibility in batch", async function () {
      const { ticketChain, user1, user2 } = await loadFixture(deployTicketChainFixture);

      await ticketChain.setDiscountEligibilityBatch([user1.address, user2.address], true);

      expect(await ticketChain.discountEligible(user1.address)).to.be.true;
      expect(await ticketChain.discountEligible(user2.address)).to.be.true;
    });

    it("Should reject setting eligibility for zero address", async function () {
      const { ticketChain } = await loadFixture(deployTicketChainFixture);

      await expect(
        ticketChain.setDiscountEligibility(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid address");
    });
  });

  describe("Buying Tickets", function () {
    it("Should allow buying a ticket at regular price", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await expect(
        ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice })
      )
        .to.emit(ticketChain, "TicketPurchased")
        .withArgs(eventId, user1.address, regularPrice, 0, 1);

      expect(await ticketChain.balanceOf(user1.address, eventId)).to.equal(1);
    });

    it("Should allow buying at discounted price for eligible users", async function () {
      const { ticketChain, user1, discountedPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.setDiscountEligibility(user1.address, true);

      await expect(
        ticketChain.connect(user1).buyTicket(eventId, { value: discountedPrice })
      )
        .to.emit(ticketChain, "TicketPurchased")
        .withArgs(eventId, user1.address, discountedPrice, 0, 1);
    });

    it("Should refund excess payment", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      const excessPayment = regularPrice + ethers.parseEther("0.05");
      const balanceBefore = await ethers.provider.getBalance(user1.address);

      const tx = await ticketChain.connect(user1).buyTicket(eventId, { value: excessPayment });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(user1.address);
      const expectedBalance = balanceBefore - regularPrice - gasUsed;

      expect(balanceAfter).to.equal(expectedBalance);
    });

    it("Should reject purchase with insufficient payment", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      const insufficientPayment = regularPrice - ethers.parseEther("0.01");

      await expect(
        ticketChain.connect(user1).buyTicket(eventId, { value: insufficientPayment })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should reject purchase when event is sold out", async function () {
      const { ticketChain, user1, user2, regularPrice, startTime, endTime, discountedPrice } =
        await loadFixture(deployTicketChainFixture);

      // Create event with max supply of 1
      await ticketChain.createEvent("Small Event", regularPrice, discountedPrice, 1, startTime, endTime);

      await ticketChain.connect(user1).buyTicket(1, { value: regularPrice });

      await expect(
        ticketChain.connect(user2).buyTicket(1, { value: regularPrice })
      ).to.be.revertedWith("Event sold out");
    });

    it("Should reject purchase after event ends", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      // Fast forward past event end time
      const eventInfo = await ticketChain.getEvent(eventId);
      await time.increaseTo(eventInfo.endTime + 1n);

      await expect(
        ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice })
      ).to.be.revertedWith("Event has ended");
    });

    it("Should prevent overselling (multiple concurrent purchases)", async function () {
      const { ticketChain, user1, user2, regularPrice, startTime, endTime, discountedPrice } =
        await loadFixture(deployTicketChainFixture);

      // Create event with max supply of 2
      await ticketChain.createEvent("Limited Event", regularPrice, discountedPrice, 2, startTime, endTime);

      // Both users buy tickets
      await ticketChain.connect(user1).buyTicket(1, { value: regularPrice });
      await ticketChain.connect(user2).buyTicket(1, { value: regularPrice });

      // Third purchase should fail
      await expect(
        ticketChain.connect(user1).buyTicket(1, { value: regularPrice })
      ).to.be.revertedWith("Event sold out");

      const eventInfo = await ticketChain.getEvent(1);
      expect(eventInfo.totalSold).to.equal(2);
    });
  });

  describe("Ticket Transfers", function () {
    it("Should allow ticket transfer between users", async function () {
      const { ticketChain, user1, user2, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      await expect(ticketChain.connect(user1).transferTicket(eventId, user2.address, 1))
        .to.emit(ticketChain, "TicketTransferred")
        .withArgs(eventId, user1.address, user2.address, 1);

      expect(await ticketChain.balanceOf(user1.address, eventId)).to.equal(0);
      expect(await ticketChain.balanceOf(user2.address, eventId)).to.equal(1);
    });

    it("Should reject transfer with insufficient tickets", async function () {
      const { ticketChain, user1, user2, eventId } =
        await loadFixture(deployWithEventFixture);

      await expect(
        ticketChain.connect(user1).transferTicket(eventId, user2.address, 1)
      ).to.be.revertedWith("Insufficient tickets");
    });

    it("Should reject transfer to zero address", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      await expect(
        ticketChain.connect(user1).transferTicket(eventId, ethers.ZeroAddress, 1)
      ).to.be.revertedWith("Cannot transfer to zero address");
    });

    it("Should reject transfer to self", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      await expect(
        ticketChain.connect(user1).transferTicket(eventId, user1.address, 1)
      ).to.be.revertedWith("Cannot transfer to self");
    });
  });

  describe("Ticket Refunds", function () {
    it("Should refund ticket before event starts", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      const balanceBefore = await ethers.provider.getBalance(user1.address);

      const tx = await ticketChain.connect(user1).refundTicket(eventId);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(user1.address);

      // Should have received refund minus gas
      expect(balanceAfter).to.equal(balanceBefore + regularPrice - gasUsed);
      expect(await ticketChain.balanceOf(user1.address, eventId)).to.equal(0);
    });

    it("Should emit TicketRefunded event", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      await expect(ticketChain.connect(user1).refundTicket(eventId))
        .to.emit(ticketChain, "TicketRefunded")
        .withArgs(eventId, user1.address, regularPrice, 1);
    });

    it("Should decrement totalSold after refund", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });
      let eventInfo = await ticketChain.getEvent(eventId);
      expect(eventInfo.totalSold).to.equal(1);

      await ticketChain.connect(user1).refundTicket(eventId);
      eventInfo = await ticketChain.getEvent(eventId);
      expect(eventInfo.totalSold).to.equal(0);
    });

    it("Should reject refund after event starts", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      const eventInfo = await ticketChain.getEvent(eventId);
      await time.increaseTo(eventInfo.startTime + 1n);

      await expect(ticketChain.connect(user1).refundTicket(eventId)).to.be.revertedWith(
        "Cannot refund after event starts"
      );
    });

    it("Should reject refund with no tickets", async function () {
      const { ticketChain, user1, eventId } = await loadFixture(deployWithEventFixture);

      await expect(ticketChain.connect(user1).refundTicket(eventId)).to.be.revertedWith(
        "No tickets to refund"
      );
    });
  });

  describe("Ticket Verification", function () {
    it("Should verify a valid unused ticket", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      const [valid, used, balance] = await ticketChain.verifyTicket(eventId, 0, user1.address);
      expect(valid).to.be.true;
      expect(used).to.be.false;
      expect(balance).to.equal(1);
    });

    it("Should mark ticket as used", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      await expect(ticketChain.connect(user1).markTicketUsed(eventId, 0))
        .to.emit(ticketChain, "TicketMarkedUsed")
        .withArgs(eventId, 0, user1.address);

      const [valid, used] = await ticketChain.verifyTicket(eventId, 0, user1.address);
      expect(valid).to.be.false;
      expect(used).to.be.true;
    });

    it("Should reject marking already used ticket", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });
      await ticketChain.connect(user1).markTicketUsed(eventId, 0);

      await expect(ticketChain.connect(user1).markTicketUsed(eventId, 0)).to.be.revertedWith(
        "Ticket already used"
      );
    });

    it("Should return invalid for non-ticket holder", async function () {
      const { ticketChain, user1, user2, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      const [valid, , balance] = await ticketChain.verifyTicket(eventId, 0, user2.address);
      expect(valid).to.be.false;
      expect(balance).to.equal(0);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to withdraw contract balance", async function () {
      const { ticketChain, owner, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await ticketChain.withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + regularPrice - gasUsed);
    });

    it("Should reject withdrawal from non-owner", async function () {
      const { ticketChain, user1 } = await loadFixture(deployWithEventFixture);

      await expect(
        ticketChain.connect(user1).withdraw()
      ).to.be.revertedWithCustomError(ticketChain, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return correct remaining supply", async function () {
      const { ticketChain, user1, regularPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      expect(await ticketChain.getRemainingSupply(eventId)).to.equal(100);

      await ticketChain.connect(user1).buyTicket(eventId, { value: regularPrice });

      expect(await ticketChain.getRemainingSupply(eventId)).to.equal(99);
    });

    it("Should return correct ticket price based on eligibility", async function () {
      const { ticketChain, user1, regularPrice, discountedPrice, eventId } =
        await loadFixture(deployWithEventFixture);

      expect(await ticketChain.getTicketPrice(eventId, user1.address)).to.equal(regularPrice);

      await ticketChain.setDiscountEligibility(user1.address, true);

      expect(await ticketChain.getTicketPrice(eventId, user1.address)).to.equal(discountedPrice);
    });
  });
});

