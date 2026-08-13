const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);

if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`
[launchpad] Node.js ${process.versions.node} is too old for this app.

Use Node.js 22.13 or newer, then rerun:

  npm install
  npm run dev

Recommended one-time setup:

  nvm install 22
  nvm use 22
`);
  process.exit(1);
}
