let ioRef = null;

function setIo(io) {
  ioRef = io;
}

function getIo() {
  return ioRef;
}

module.exports = {
  setIo,
  getIo,
};
