let toSend = require("./to_send_0306.json");
let names = require("./winner-list.json");
let names0316 = require("./0316.json");

let already = [...toSend, ...names];

let aleadySend = already.map(name => name[1]);

let dup = names0316.filter(one => aleadySend.indexOf(one[1]) === -1 && one[1].startsWith("CYBEX"));

console.log("Dup: ", dup);
const fs = require("fs");
fs.writeFileSync("./cybex-to-send-0316.json", JSON.stringify(dup));

let xn0316 = names0316.map(p => p[0]).reduce((xn, p) => {
  xn[p] = true;
  return xn;
}, {});
fs.writeFileSync("./xn0316.json", JSON.stringify(xn0316));