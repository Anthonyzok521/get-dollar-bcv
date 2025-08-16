
const mongoose = require('mongoose');

const dollarRateSchema = new mongoose.Schema({
  tasa: {
    type: Number,
    required: true,
  },
  fecha: {
    type: String,
    required: true,
  },
  fuente: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model('DollarRate', dollarRateSchema);
