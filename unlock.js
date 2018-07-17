const { getWalletReader } = require("./wallet");
const { inspect } = require("util");
async function main() {
  console.log(inspect("S"))
  let filename = process.argv[2];
  let s = await getWalletReader()(filename).catch(e => console.error(e));
  console.log("S: ", inspect(s, {
    depth: 5
  }));
}

main();
