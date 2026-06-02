const fs = require("fs");

const readData = (path) => {
  return JSON.parse(fs.readFileSync(path, "utf8"));
};

const writeData = (path, data) => {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
};

module.exports = { readData, writeData };
