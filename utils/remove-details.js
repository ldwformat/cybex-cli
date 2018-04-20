const assert = require("assert");
const file = process.argv[2];
console.log("Filter: ", file);
assert(file);
let records = require(file);
console.log("Record:", records);
for (let record of records) {
  delete record.details;
}
console.log(JSON.stringify(records))


