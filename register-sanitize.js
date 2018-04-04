const fs = require("fs");

let files = fs.readdirSync("./register");
let register = files
  .map(fileName => JSON.parse(fs.readFileSync(`./register/${fileName}`)))
  .reduce((full, next) => full.concat(next));

let sanitized = register.reduce((full, next) => {
  if (!next || !next.users || !next.users.length) return full;
  let block = next.users.map(user => ({
    ...user,
    timestamp: next.timestamp,
    blockNum: next.blockNum
  }));
  full = [...full, ...block];
  return full;
}, []);

fs.writeFileSync("./register_final.json", JSON.stringify(sanitized));
