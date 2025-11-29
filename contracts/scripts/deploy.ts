import { ethers } from "hardhat";

async function main() {
  console.log("Deploying TicketChain contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy the contract
  const TicketChain = await ethers.getContractFactory("TicketChain");
  const ticketChain = await TicketChain.deploy();

  await ticketChain.waitForDeployment();
  const contractAddress = await ticketChain.getAddress();

  console.log("TicketChain deployed to:", contractAddress);

  // For demo: Create a sample event
  const now = Math.floor(Date.now() / 1000);
  const oneWeekFromNow = now + 7 * 24 * 60 * 60;
  const twoWeeksFromNow = now + 14 * 24 * 60 * 60;

  console.log("\nCreating sample event...");
  const tx = await ticketChain.createEvent(
    "BU Spring Concert 2024",
    ethers.parseEther("0.05"),     // Regular price: 0.05 ETH
    ethers.parseEther("0.03"),     // Discounted price: 0.03 ETH
    1000,                           // Max supply
    oneWeekFromNow,                 // Start time
    twoWeeksFromNow                 // End time
  );
  await tx.wait();
  console.log("Sample event created with ID: 1");

  // Output deployment info
  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", contractAddress);
  console.log("Owner Address:", deployer.address);
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("========================\n");

  // Save deployment info for backend/frontend
  const fs = await import("fs");
  const deploymentInfo = {
    contractAddress,
    ownerAddress: deployer.address,
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    "./deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

