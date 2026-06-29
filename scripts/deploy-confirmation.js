const { execSync } = require("child_process");
const readline = require("readline");

try {
  const out = execSync("wrangler whoami", { encoding: "utf8" });
  console.log(out);
} catch (err) {
  console.log("⚠ You are not logged in to wrangler.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Do you want to login now ? (yes/no): ", (login) => {
    if (login.toLowerCase() === "yes") {
      try {
        execSync("wrangler login", { stdio: "inherit" });
        execSync("wrangler whoami", { stdio: "inherit" });
      } catch {
        console.error("Login failed.");
        process.exit(1);
      }
    } else {
      console.log("Login Cancelled.");
      process.exit(1);
    }
    rl.question(`⟢ Deploying Project Name: ${process.env.npm_package_name}\n⌲ Proceed With Deployment? (yes/no): `, (confirm) => {
      if (confirm.toLowerCase() !== "yes") {
        console.log("Deployment Cancelled.");
        process.exit(1);
      }
      rl.close();
    });
  });
}
