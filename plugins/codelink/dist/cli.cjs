#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/qrcode/lib/can-promise.js
var require_can_promise = __commonJS({
  "node_modules/qrcode/lib/can-promise.js"(exports2, module2) {
    module2.exports = function() {
      return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
    };
  }
});

// node_modules/qrcode/lib/core/utils.js
var require_utils = __commonJS({
  "node_modules/qrcode/lib/core/utils.js"(exports2) {
    var toSJISFunction;
    var CODEWORDS_COUNT = [
      0,
      // Not used
      26,
      44,
      70,
      100,
      134,
      172,
      196,
      242,
      292,
      346,
      404,
      466,
      532,
      581,
      655,
      733,
      815,
      901,
      991,
      1085,
      1156,
      1258,
      1364,
      1474,
      1588,
      1706,
      1828,
      1921,
      2051,
      2185,
      2323,
      2465,
      2611,
      2761,
      2876,
      3034,
      3196,
      3362,
      3532,
      3706
    ];
    exports2.getSymbolSize = function getSymbolSize(version) {
      if (!version) throw new Error('"version" cannot be null or undefined');
      if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40');
      return version * 4 + 17;
    };
    exports2.getSymbolTotalCodewords = function getSymbolTotalCodewords(version) {
      return CODEWORDS_COUNT[version];
    };
    exports2.getBCHDigit = function(data) {
      let digit = 0;
      while (data !== 0) {
        digit++;
        data >>>= 1;
      }
      return digit;
    };
    exports2.setToSJISFunction = function setToSJISFunction(f) {
      if (typeof f !== "function") {
        throw new Error('"toSJISFunc" is not a valid function.');
      }
      toSJISFunction = f;
    };
    exports2.isKanjiModeEnabled = function() {
      return typeof toSJISFunction !== "undefined";
    };
    exports2.toSJIS = function toSJIS(kanji) {
      return toSJISFunction(kanji);
    };
  }
});

// node_modules/qrcode/lib/core/error-correction-level.js
var require_error_correction_level = __commonJS({
  "node_modules/qrcode/lib/core/error-correction-level.js"(exports2) {
    exports2.L = { bit: 1 };
    exports2.M = { bit: 0 };
    exports2.Q = { bit: 3 };
    exports2.H = { bit: 2 };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "l":
        case "low":
          return exports2.L;
        case "m":
        case "medium":
          return exports2.M;
        case "q":
        case "quartile":
          return exports2.Q;
        case "h":
        case "high":
          return exports2.H;
        default:
          throw new Error("Unknown EC Level: " + string);
      }
    }
    exports2.isValid = function isValid(level) {
      return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
    };
    exports2.from = function from(value, defaultValue) {
      if (exports2.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  }
});

// node_modules/qrcode/lib/core/bit-buffer.js
var require_bit_buffer = __commonJS({
  "node_modules/qrcode/lib/core/bit-buffer.js"(exports2, module2) {
    function BitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    BitBuffer.prototype = {
      get: function(index) {
        const bufIndex = Math.floor(index / 8);
        return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
      },
      put: function(num, length) {
        for (let i = 0; i < length; i++) {
          this.putBit((num >>> length - i - 1 & 1) === 1);
        }
      },
      getLengthInBits: function() {
        return this.length;
      },
      putBit: function(bit) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }
        if (bit) {
          this.buffer[bufIndex] |= 128 >>> this.length % 8;
        }
        this.length++;
      }
    };
    module2.exports = BitBuffer;
  }
});

// node_modules/qrcode/lib/core/bit-matrix.js
var require_bit_matrix = __commonJS({
  "node_modules/qrcode/lib/core/bit-matrix.js"(exports2, module2) {
    function BitMatrix(size) {
      if (!size || size < 1) {
        throw new Error("BitMatrix size must be defined and greater than 0");
      }
      this.size = size;
      this.data = new Uint8Array(size * size);
      this.reservedBit = new Uint8Array(size * size);
    }
    BitMatrix.prototype.set = function(row, col, value, reserved) {
      const index = row * this.size + col;
      this.data[index] = value;
      if (reserved) this.reservedBit[index] = true;
    };
    BitMatrix.prototype.get = function(row, col) {
      return this.data[row * this.size + col];
    };
    BitMatrix.prototype.xor = function(row, col, value) {
      this.data[row * this.size + col] ^= value;
    };
    BitMatrix.prototype.isReserved = function(row, col) {
      return this.reservedBit[row * this.size + col];
    };
    module2.exports = BitMatrix;
  }
});

// node_modules/qrcode/lib/core/alignment-pattern.js
var require_alignment_pattern = __commonJS({
  "node_modules/qrcode/lib/core/alignment-pattern.js"(exports2) {
    var getSymbolSize = require_utils().getSymbolSize;
    exports2.getRowColCoords = function getRowColCoords(version) {
      if (version === 1) return [];
      const posCount = Math.floor(version / 7) + 2;
      const size = getSymbolSize(version);
      const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
      const positions = [size - 7];
      for (let i = 1; i < posCount - 1; i++) {
        positions[i] = positions[i - 1] - intervals;
      }
      positions.push(6);
      return positions.reverse();
    };
    exports2.getPositions = function getPositions(version) {
      const coords = [];
      const pos = exports2.getRowColCoords(version);
      const posLength = pos.length;
      for (let i = 0; i < posLength; i++) {
        for (let j = 0; j < posLength; j++) {
          if (i === 0 && j === 0 || // top-left
          i === 0 && j === posLength - 1 || // bottom-left
          i === posLength - 1 && j === 0) {
            continue;
          }
          coords.push([pos[i], pos[j]]);
        }
      }
      return coords;
    };
  }
});

// node_modules/qrcode/lib/core/finder-pattern.js
var require_finder_pattern = __commonJS({
  "node_modules/qrcode/lib/core/finder-pattern.js"(exports2) {
    var getSymbolSize = require_utils().getSymbolSize;
    var FINDER_PATTERN_SIZE = 7;
    exports2.getPositions = function getPositions(version) {
      const size = getSymbolSize(version);
      return [
        // top-left
        [0, 0],
        // top-right
        [size - FINDER_PATTERN_SIZE, 0],
        // bottom-left
        [0, size - FINDER_PATTERN_SIZE]
      ];
    };
  }
});

// node_modules/qrcode/lib/core/mask-pattern.js
var require_mask_pattern = __commonJS({
  "node_modules/qrcode/lib/core/mask-pattern.js"(exports2) {
    exports2.Patterns = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
    var PenaltyScores = {
      N1: 3,
      N2: 3,
      N3: 40,
      N4: 10
    };
    exports2.isValid = function isValid(mask) {
      return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
    };
    exports2.from = function from(value) {
      return exports2.isValid(value) ? parseInt(value, 10) : void 0;
    };
    exports2.getPenaltyN1 = function getPenaltyN1(data) {
      const size = data.size;
      let points = 0;
      let sameCountCol = 0;
      let sameCountRow = 0;
      let lastCol = null;
      let lastRow = null;
      for (let row = 0; row < size; row++) {
        sameCountCol = sameCountRow = 0;
        lastCol = lastRow = null;
        for (let col = 0; col < size; col++) {
          let module3 = data.get(row, col);
          if (module3 === lastCol) {
            sameCountCol++;
          } else {
            if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
            lastCol = module3;
            sameCountCol = 1;
          }
          module3 = data.get(col, row);
          if (module3 === lastRow) {
            sameCountRow++;
          } else {
            if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
            lastRow = module3;
            sameCountRow = 1;
          }
        }
        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
      }
      return points;
    };
    exports2.getPenaltyN2 = function getPenaltyN2(data) {
      const size = data.size;
      let points = 0;
      for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size - 1; col++) {
          const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
          if (last === 4 || last === 0) points++;
        }
      }
      return points * PenaltyScores.N2;
    };
    exports2.getPenaltyN3 = function getPenaltyN3(data) {
      const size = data.size;
      let points = 0;
      let bitsCol = 0;
      let bitsRow = 0;
      for (let row = 0; row < size; row++) {
        bitsCol = bitsRow = 0;
        for (let col = 0; col < size; col++) {
          bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
          if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
          bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
          if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
        }
      }
      return points * PenaltyScores.N3;
    };
    exports2.getPenaltyN4 = function getPenaltyN4(data) {
      let darkCount = 0;
      const modulesCount = data.data.length;
      for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
      const k = Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10);
      return k * PenaltyScores.N4;
    };
    function getMaskAt(maskPattern, i, j) {
      switch (maskPattern) {
        case exports2.Patterns.PATTERN000:
          return (i + j) % 2 === 0;
        case exports2.Patterns.PATTERN001:
          return i % 2 === 0;
        case exports2.Patterns.PATTERN010:
          return j % 3 === 0;
        case exports2.Patterns.PATTERN011:
          return (i + j) % 3 === 0;
        case exports2.Patterns.PATTERN100:
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case exports2.Patterns.PATTERN101:
          return i * j % 2 + i * j % 3 === 0;
        case exports2.Patterns.PATTERN110:
          return (i * j % 2 + i * j % 3) % 2 === 0;
        case exports2.Patterns.PATTERN111:
          return (i * j % 3 + (i + j) % 2) % 2 === 0;
        default:
          throw new Error("bad maskPattern:" + maskPattern);
      }
    }
    exports2.applyMask = function applyMask(pattern, data) {
      const size = data.size;
      for (let col = 0; col < size; col++) {
        for (let row = 0; row < size; row++) {
          if (data.isReserved(row, col)) continue;
          data.xor(row, col, getMaskAt(pattern, row, col));
        }
      }
    };
    exports2.getBestMask = function getBestMask(data, setupFormatFunc) {
      const numPatterns = Object.keys(exports2.Patterns).length;
      let bestPattern = 0;
      let lowerPenalty = Infinity;
      for (let p = 0; p < numPatterns; p++) {
        setupFormatFunc(p);
        exports2.applyMask(p, data);
        const penalty = exports2.getPenaltyN1(data) + exports2.getPenaltyN2(data) + exports2.getPenaltyN3(data) + exports2.getPenaltyN4(data);
        exports2.applyMask(p, data);
        if (penalty < lowerPenalty) {
          lowerPenalty = penalty;
          bestPattern = p;
        }
      }
      return bestPattern;
    };
  }
});

// node_modules/qrcode/lib/core/error-correction-code.js
var require_error_correction_code = __commonJS({
  "node_modules/qrcode/lib/core/error-correction-code.js"(exports2) {
    var ECLevel = require_error_correction_level();
    var EC_BLOCKS_TABLE = [
      // L  M  Q  H
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      1,
      2,
      2,
      4,
      1,
      2,
      4,
      4,
      2,
      4,
      4,
      4,
      2,
      4,
      6,
      5,
      2,
      4,
      6,
      6,
      2,
      5,
      8,
      8,
      4,
      5,
      8,
      8,
      4,
      5,
      8,
      11,
      4,
      8,
      10,
      11,
      4,
      9,
      12,
      16,
      4,
      9,
      16,
      16,
      6,
      10,
      12,
      18,
      6,
      10,
      17,
      16,
      6,
      11,
      16,
      19,
      6,
      13,
      18,
      21,
      7,
      14,
      21,
      25,
      8,
      16,
      20,
      25,
      8,
      17,
      23,
      25,
      9,
      17,
      23,
      34,
      9,
      18,
      25,
      30,
      10,
      20,
      27,
      32,
      12,
      21,
      29,
      35,
      12,
      23,
      34,
      37,
      12,
      25,
      34,
      40,
      13,
      26,
      35,
      42,
      14,
      28,
      38,
      45,
      15,
      29,
      40,
      48,
      16,
      31,
      43,
      51,
      17,
      33,
      45,
      54,
      18,
      35,
      48,
      57,
      19,
      37,
      51,
      60,
      19,
      38,
      53,
      63,
      20,
      40,
      56,
      66,
      21,
      43,
      59,
      70,
      22,
      45,
      62,
      74,
      24,
      47,
      65,
      77,
      25,
      49,
      68,
      81
    ];
    var EC_CODEWORDS_TABLE = [
      // L  M  Q  H
      7,
      10,
      13,
      17,
      10,
      16,
      22,
      28,
      15,
      26,
      36,
      44,
      20,
      36,
      52,
      64,
      26,
      48,
      72,
      88,
      36,
      64,
      96,
      112,
      40,
      72,
      108,
      130,
      48,
      88,
      132,
      156,
      60,
      110,
      160,
      192,
      72,
      130,
      192,
      224,
      80,
      150,
      224,
      264,
      96,
      176,
      260,
      308,
      104,
      198,
      288,
      352,
      120,
      216,
      320,
      384,
      132,
      240,
      360,
      432,
      144,
      280,
      408,
      480,
      168,
      308,
      448,
      532,
      180,
      338,
      504,
      588,
      196,
      364,
      546,
      650,
      224,
      416,
      600,
      700,
      224,
      442,
      644,
      750,
      252,
      476,
      690,
      816,
      270,
      504,
      750,
      900,
      300,
      560,
      810,
      960,
      312,
      588,
      870,
      1050,
      336,
      644,
      952,
      1110,
      360,
      700,
      1020,
      1200,
      390,
      728,
      1050,
      1260,
      420,
      784,
      1140,
      1350,
      450,
      812,
      1200,
      1440,
      480,
      868,
      1290,
      1530,
      510,
      924,
      1350,
      1620,
      540,
      980,
      1440,
      1710,
      570,
      1036,
      1530,
      1800,
      570,
      1064,
      1590,
      1890,
      600,
      1120,
      1680,
      1980,
      630,
      1204,
      1770,
      2100,
      660,
      1260,
      1860,
      2220,
      720,
      1316,
      1950,
      2310,
      750,
      1372,
      2040,
      2430
    ];
    exports2.getBlocksCount = function getBlocksCount(version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
        case ECLevel.M:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
        case ECLevel.H:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    exports2.getTotalCodewordsCount = function getTotalCodewordsCount(version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
        case ECLevel.M:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
        case ECLevel.H:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
  }
});

// node_modules/qrcode/lib/core/galois-field.js
var require_galois_field = __commonJS({
  "node_modules/qrcode/lib/core/galois-field.js"(exports2) {
    var EXP_TABLE = new Uint8Array(512);
    var LOG_TABLE = new Uint8Array(256);
    (function initTables() {
      let x = 1;
      for (let i = 0; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;
        x <<= 1;
        if (x & 256) {
          x ^= 285;
        }
      }
      for (let i = 255; i < 512; i++) {
        EXP_TABLE[i] = EXP_TABLE[i - 255];
      }
    })();
    exports2.log = function log(n) {
      if (n < 1) throw new Error("log(" + n + ")");
      return LOG_TABLE[n];
    };
    exports2.exp = function exp(n) {
      return EXP_TABLE[n];
    };
    exports2.mul = function mul(x, y) {
      if (x === 0 || y === 0) return 0;
      return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
    };
  }
});

// node_modules/qrcode/lib/core/polynomial.js
var require_polynomial = __commonJS({
  "node_modules/qrcode/lib/core/polynomial.js"(exports2) {
    var GF = require_galois_field();
    exports2.mul = function mul(p1, p2) {
      const coeff = new Uint8Array(p1.length + p2.length - 1);
      for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
          coeff[i + j] ^= GF.mul(p1[i], p2[j]);
        }
      }
      return coeff;
    };
    exports2.mod = function mod(divident, divisor) {
      let result = new Uint8Array(divident);
      while (result.length - divisor.length >= 0) {
        const coeff = result[0];
        for (let i = 0; i < divisor.length; i++) {
          result[i] ^= GF.mul(divisor[i], coeff);
        }
        let offset = 0;
        while (offset < result.length && result[offset] === 0) offset++;
        result = result.slice(offset);
      }
      return result;
    };
    exports2.generateECPolynomial = function generateECPolynomial(degree) {
      let poly = new Uint8Array([1]);
      for (let i = 0; i < degree; i++) {
        poly = exports2.mul(poly, new Uint8Array([1, GF.exp(i)]));
      }
      return poly;
    };
  }
});

// node_modules/qrcode/lib/core/reed-solomon-encoder.js
var require_reed_solomon_encoder = __commonJS({
  "node_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports2, module2) {
    var Polynomial = require_polynomial();
    function ReedSolomonEncoder(degree) {
      this.genPoly = void 0;
      this.degree = degree;
      if (this.degree) this.initialize(this.degree);
    }
    ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
      this.degree = degree;
      this.genPoly = Polynomial.generateECPolynomial(this.degree);
    };
    ReedSolomonEncoder.prototype.encode = function encode(data) {
      if (!this.genPoly) {
        throw new Error("Encoder not initialized");
      }
      const paddedData = new Uint8Array(data.length + this.degree);
      paddedData.set(data);
      const remainder = Polynomial.mod(paddedData, this.genPoly);
      const start = this.degree - remainder.length;
      if (start > 0) {
        const buff = new Uint8Array(this.degree);
        buff.set(remainder, start);
        return buff;
      }
      return remainder;
    };
    module2.exports = ReedSolomonEncoder;
  }
});

// node_modules/qrcode/lib/core/version-check.js
var require_version_check = __commonJS({
  "node_modules/qrcode/lib/core/version-check.js"(exports2) {
    exports2.isValid = function isValid(version) {
      return !isNaN(version) && version >= 1 && version <= 40;
    };
  }
});

// node_modules/qrcode/lib/core/regex.js
var require_regex = __commonJS({
  "node_modules/qrcode/lib/core/regex.js"(exports2) {
    var numeric = "[0-9]+";
    var alphanumeric = "[A-Z $%*+\\-./:]+";
    var kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
    kanji = kanji.replace(/u/g, "\\u");
    var byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
    exports2.KANJI = new RegExp(kanji, "g");
    exports2.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
    exports2.BYTE = new RegExp(byte, "g");
    exports2.NUMERIC = new RegExp(numeric, "g");
    exports2.ALPHANUMERIC = new RegExp(alphanumeric, "g");
    var TEST_KANJI = new RegExp("^" + kanji + "$");
    var TEST_NUMERIC = new RegExp("^" + numeric + "$");
    var TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
    exports2.testKanji = function testKanji(str) {
      return TEST_KANJI.test(str);
    };
    exports2.testNumeric = function testNumeric(str) {
      return TEST_NUMERIC.test(str);
    };
    exports2.testAlphanumeric = function testAlphanumeric(str) {
      return TEST_ALPHANUMERIC.test(str);
    };
  }
});

// node_modules/qrcode/lib/core/mode.js
var require_mode = __commonJS({
  "node_modules/qrcode/lib/core/mode.js"(exports2) {
    var VersionCheck = require_version_check();
    var Regex = require_regex();
    exports2.NUMERIC = {
      id: "Numeric",
      bit: 1 << 0,
      ccBits: [10, 12, 14]
    };
    exports2.ALPHANUMERIC = {
      id: "Alphanumeric",
      bit: 1 << 1,
      ccBits: [9, 11, 13]
    };
    exports2.BYTE = {
      id: "Byte",
      bit: 1 << 2,
      ccBits: [8, 16, 16]
    };
    exports2.KANJI = {
      id: "Kanji",
      bit: 1 << 3,
      ccBits: [8, 10, 12]
    };
    exports2.MIXED = {
      bit: -1
    };
    exports2.getCharCountIndicator = function getCharCountIndicator(mode, version) {
      if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
      if (!VersionCheck.isValid(version)) {
        throw new Error("Invalid version: " + version);
      }
      if (version >= 1 && version < 10) return mode.ccBits[0];
      else if (version < 27) return mode.ccBits[1];
      return mode.ccBits[2];
    };
    exports2.getBestModeForData = function getBestModeForData(dataStr) {
      if (Regex.testNumeric(dataStr)) return exports2.NUMERIC;
      else if (Regex.testAlphanumeric(dataStr)) return exports2.ALPHANUMERIC;
      else if (Regex.testKanji(dataStr)) return exports2.KANJI;
      else return exports2.BYTE;
    };
    exports2.toString = function toString(mode) {
      if (mode && mode.id) return mode.id;
      throw new Error("Invalid mode");
    };
    exports2.isValid = function isValid(mode) {
      return mode && mode.bit && mode.ccBits;
    };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "numeric":
          return exports2.NUMERIC;
        case "alphanumeric":
          return exports2.ALPHANUMERIC;
        case "kanji":
          return exports2.KANJI;
        case "byte":
          return exports2.BYTE;
        default:
          throw new Error("Unknown mode: " + string);
      }
    }
    exports2.from = function from(value, defaultValue) {
      if (exports2.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  }
});

// node_modules/qrcode/lib/core/version.js
var require_version = __commonJS({
  "node_modules/qrcode/lib/core/version.js"(exports2) {
    var Utils = require_utils();
    var ECCode = require_error_correction_code();
    var ECLevel = require_error_correction_level();
    var Mode = require_mode();
    var VersionCheck = require_version_check();
    var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    var G18_BCH = Utils.getBCHDigit(G18);
    function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        if (length <= exports2.getCapacity(currentVersion, errorCorrectionLevel, mode)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    function getReservedBitsCount(mode, version) {
      return Mode.getCharCountIndicator(mode, version) + 4;
    }
    function getTotalBitsFromDataArray(segments, version) {
      let totalBits = 0;
      segments.forEach(function(data) {
        const reservedBits = getReservedBitsCount(data.mode, version);
        totalBits += reservedBits + data.getBitsLength();
      });
      return totalBits;
    }
    function getBestVersionForMixedData(segments, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        const length = getTotalBitsFromDataArray(segments, currentVersion);
        if (length <= exports2.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    exports2.from = function from(value, defaultValue) {
      if (VersionCheck.isValid(value)) {
        return parseInt(value, 10);
      }
      return defaultValue;
    };
    exports2.getCapacity = function getCapacity(version, errorCorrectionLevel, mode) {
      if (!VersionCheck.isValid(version)) {
        throw new Error("Invalid QR Code version");
      }
      if (typeof mode === "undefined") mode = Mode.BYTE;
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (mode === Mode.MIXED) return dataTotalCodewordsBits;
      const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
      switch (mode) {
        case Mode.NUMERIC:
          return Math.floor(usableBits / 10 * 3);
        case Mode.ALPHANUMERIC:
          return Math.floor(usableBits / 11 * 2);
        case Mode.KANJI:
          return Math.floor(usableBits / 13);
        case Mode.BYTE:
        default:
          return Math.floor(usableBits / 8);
      }
    };
    exports2.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel) {
      let seg;
      const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
      if (Array.isArray(data)) {
        if (data.length > 1) {
          return getBestVersionForMixedData(data, ecl);
        }
        if (data.length === 0) {
          return 1;
        }
        seg = data[0];
      } else {
        seg = data;
      }
      return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
    };
    exports2.getEncodedBits = function getEncodedBits(version) {
      if (!VersionCheck.isValid(version) || version < 7) {
        throw new Error("Invalid QR Code version");
      }
      let d = version << 12;
      while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
        d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
      }
      return version << 12 | d;
    };
  }
});

// node_modules/qrcode/lib/core/format-info.js
var require_format_info = __commonJS({
  "node_modules/qrcode/lib/core/format-info.js"(exports2) {
    var Utils = require_utils();
    var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    var G15_BCH = Utils.getBCHDigit(G15);
    exports2.getEncodedBits = function getEncodedBits(errorCorrectionLevel, mask) {
      const data = errorCorrectionLevel.bit << 3 | mask;
      let d = data << 10;
      while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
        d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
      }
      return (data << 10 | d) ^ G15_MASK;
    };
  }
});

// node_modules/qrcode/lib/core/numeric-data.js
var require_numeric_data = __commonJS({
  "node_modules/qrcode/lib/core/numeric-data.js"(exports2, module2) {
    var Mode = require_mode();
    function NumericData(data) {
      this.mode = Mode.NUMERIC;
      this.data = data.toString();
    }
    NumericData.getBitsLength = function getBitsLength(length) {
      return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
    };
    NumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    NumericData.prototype.getBitsLength = function getBitsLength() {
      return NumericData.getBitsLength(this.data.length);
    };
    NumericData.prototype.write = function write(bitBuffer) {
      let i, group, value;
      for (i = 0; i + 3 <= this.data.length; i += 3) {
        group = this.data.substr(i, 3);
        value = parseInt(group, 10);
        bitBuffer.put(value, 10);
      }
      const remainingNum = this.data.length - i;
      if (remainingNum > 0) {
        group = this.data.substr(i);
        value = parseInt(group, 10);
        bitBuffer.put(value, remainingNum * 3 + 1);
      }
    };
    module2.exports = NumericData;
  }
});

// node_modules/qrcode/lib/core/alphanumeric-data.js
var require_alphanumeric_data = __commonJS({
  "node_modules/qrcode/lib/core/alphanumeric-data.js"(exports2, module2) {
    var Mode = require_mode();
    var ALPHA_NUM_CHARS = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      " ",
      "$",
      "%",
      "*",
      "+",
      "-",
      ".",
      "/",
      ":"
    ];
    function AlphanumericData(data) {
      this.mode = Mode.ALPHANUMERIC;
      this.data = data;
    }
    AlphanumericData.getBitsLength = function getBitsLength(length) {
      return 11 * Math.floor(length / 2) + 6 * (length % 2);
    };
    AlphanumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    AlphanumericData.prototype.getBitsLength = function getBitsLength() {
      return AlphanumericData.getBitsLength(this.data.length);
    };
    AlphanumericData.prototype.write = function write(bitBuffer) {
      let i;
      for (i = 0; i + 2 <= this.data.length; i += 2) {
        let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
        value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
        bitBuffer.put(value, 11);
      }
      if (this.data.length % 2) {
        bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
      }
    };
    module2.exports = AlphanumericData;
  }
});

// node_modules/qrcode/lib/core/byte-data.js
var require_byte_data = __commonJS({
  "node_modules/qrcode/lib/core/byte-data.js"(exports2, module2) {
    var Mode = require_mode();
    function ByteData(data) {
      this.mode = Mode.BYTE;
      if (typeof data === "string") {
        this.data = new TextEncoder().encode(data);
      } else {
        this.data = new Uint8Array(data);
      }
    }
    ByteData.getBitsLength = function getBitsLength(length) {
      return length * 8;
    };
    ByteData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    ByteData.prototype.getBitsLength = function getBitsLength() {
      return ByteData.getBitsLength(this.data.length);
    };
    ByteData.prototype.write = function(bitBuffer) {
      for (let i = 0, l = this.data.length; i < l; i++) {
        bitBuffer.put(this.data[i], 8);
      }
    };
    module2.exports = ByteData;
  }
});

// node_modules/qrcode/lib/core/kanji-data.js
var require_kanji_data = __commonJS({
  "node_modules/qrcode/lib/core/kanji-data.js"(exports2, module2) {
    var Mode = require_mode();
    var Utils = require_utils();
    function KanjiData(data) {
      this.mode = Mode.KANJI;
      this.data = data;
    }
    KanjiData.getBitsLength = function getBitsLength(length) {
      return length * 13;
    };
    KanjiData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    KanjiData.prototype.getBitsLength = function getBitsLength() {
      return KanjiData.getBitsLength(this.data.length);
    };
    KanjiData.prototype.write = function(bitBuffer) {
      let i;
      for (i = 0; i < this.data.length; i++) {
        let value = Utils.toSJIS(this.data[i]);
        if (value >= 33088 && value <= 40956) {
          value -= 33088;
        } else if (value >= 57408 && value <= 60351) {
          value -= 49472;
        } else {
          throw new Error(
            "Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8"
          );
        }
        value = (value >>> 8 & 255) * 192 + (value & 255);
        bitBuffer.put(value, 13);
      }
    };
    module2.exports = KanjiData;
  }
});

// node_modules/dijkstrajs/dijkstra.js
var require_dijkstra = __commonJS({
  "node_modules/dijkstrajs/dijkstra.js"(exports2, module2) {
    "use strict";
    var dijkstra = {
      single_source_shortest_paths: function(graph, s, d) {
        var predecessors = {};
        var costs = {};
        costs[s] = 0;
        var open = dijkstra.PriorityQueue.make();
        open.push(s, 0);
        var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
        while (!open.empty()) {
          closest = open.pop();
          u = closest.value;
          cost_of_s_to_u = closest.cost;
          adjacent_nodes = graph[u] || {};
          for (v in adjacent_nodes) {
            if (adjacent_nodes.hasOwnProperty(v)) {
              cost_of_e = adjacent_nodes[v];
              cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
              cost_of_s_to_v = costs[v];
              first_visit = typeof costs[v] === "undefined";
              if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
                costs[v] = cost_of_s_to_u_plus_cost_of_e;
                open.push(v, cost_of_s_to_u_plus_cost_of_e);
                predecessors[v] = u;
              }
            }
          }
        }
        if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
          var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
          throw new Error(msg);
        }
        return predecessors;
      },
      extract_shortest_path_from_predecessor_list: function(predecessors, d) {
        var nodes = [];
        var u = d;
        var predecessor;
        while (u) {
          nodes.push(u);
          predecessor = predecessors[u];
          u = predecessors[u];
        }
        nodes.reverse();
        return nodes;
      },
      find_path: function(graph, s, d) {
        var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
        return dijkstra.extract_shortest_path_from_predecessor_list(
          predecessors,
          d
        );
      },
      /**
       * A very naive priority queue implementation.
       */
      PriorityQueue: {
        make: function(opts) {
          var T = dijkstra.PriorityQueue, t = {}, key;
          opts = opts || {};
          for (key in T) {
            if (T.hasOwnProperty(key)) {
              t[key] = T[key];
            }
          }
          t.queue = [];
          t.sorter = opts.sorter || T.default_sorter;
          return t;
        },
        default_sorter: function(a, b) {
          return a.cost - b.cost;
        },
        /**
         * Add a new item to the queue and ensure the highest priority element
         * is at the front of the queue.
         */
        push: function(value, cost) {
          var item = { value, cost };
          this.queue.push(item);
          this.queue.sort(this.sorter);
        },
        /**
         * Return the highest priority element in the queue.
         */
        pop: function() {
          return this.queue.shift();
        },
        empty: function() {
          return this.queue.length === 0;
        }
      }
    };
    if (typeof module2 !== "undefined") {
      module2.exports = dijkstra;
    }
  }
});

// node_modules/qrcode/lib/core/segments.js
var require_segments = __commonJS({
  "node_modules/qrcode/lib/core/segments.js"(exports2) {
    var Mode = require_mode();
    var NumericData = require_numeric_data();
    var AlphanumericData = require_alphanumeric_data();
    var ByteData = require_byte_data();
    var KanjiData = require_kanji_data();
    var Regex = require_regex();
    var Utils = require_utils();
    var dijkstra = require_dijkstra();
    function getStringByteLength(str) {
      return unescape(encodeURIComponent(str)).length;
    }
    function getSegments(regex, mode, str) {
      const segments = [];
      let result;
      while ((result = regex.exec(str)) !== null) {
        segments.push({
          data: result[0],
          index: result.index,
          mode,
          length: result[0].length
        });
      }
      return segments;
    }
    function getSegmentsFromString(dataStr) {
      const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
      const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
      let byteSegs;
      let kanjiSegs;
      if (Utils.isKanjiModeEnabled()) {
        byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
        kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
      } else {
        byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
        kanjiSegs = [];
      }
      const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);
      return segs.sort(function(s1, s2) {
        return s1.index - s2.index;
      }).map(function(obj) {
        return {
          data: obj.data,
          mode: obj.mode,
          length: obj.length
        };
      });
    }
    function getSegmentBitsLength(length, mode) {
      switch (mode) {
        case Mode.NUMERIC:
          return NumericData.getBitsLength(length);
        case Mode.ALPHANUMERIC:
          return AlphanumericData.getBitsLength(length);
        case Mode.KANJI:
          return KanjiData.getBitsLength(length);
        case Mode.BYTE:
          return ByteData.getBitsLength(length);
      }
    }
    function mergeSegments(segs) {
      return segs.reduce(function(acc, curr) {
        const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
        if (prevSeg && prevSeg.mode === curr.mode) {
          acc[acc.length - 1].data += curr.data;
          return acc;
        }
        acc.push(curr);
        return acc;
      }, []);
    }
    function buildNodes(segs) {
      const nodes = [];
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        switch (seg.mode) {
          case Mode.NUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.ALPHANUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.KANJI:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
            break;
          case Mode.BYTE:
            nodes.push([
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
        }
      }
      return nodes;
    }
    function buildGraph(nodes, version) {
      const table = {};
      const graph = { start: {} };
      let prevNodeIds = ["start"];
      for (let i = 0; i < nodes.length; i++) {
        const nodeGroup = nodes[i];
        const currentNodeIds = [];
        for (let j = 0; j < nodeGroup.length; j++) {
          const node = nodeGroup[j];
          const key = "" + i + j;
          currentNodeIds.push(key);
          table[key] = { node, lastCount: 0 };
          graph[key] = {};
          for (let n = 0; n < prevNodeIds.length; n++) {
            const prevNodeId = prevNodeIds[n];
            if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
              graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
              table[prevNodeId].lastCount += node.length;
            } else {
              if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
              graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version);
            }
          }
        }
        prevNodeIds = currentNodeIds;
      }
      for (let n = 0; n < prevNodeIds.length; n++) {
        graph[prevNodeIds[n]].end = 0;
      }
      return { map: graph, table };
    }
    function buildSingleSegment(data, modesHint) {
      let mode;
      const bestMode = Mode.getBestModeForData(data);
      mode = Mode.from(modesHint, bestMode);
      if (mode !== Mode.BYTE && mode.bit < bestMode.bit) {
        throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode) + ".\n Suggested mode is: " + Mode.toString(bestMode));
      }
      if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
        mode = Mode.BYTE;
      }
      switch (mode) {
        case Mode.NUMERIC:
          return new NumericData(data);
        case Mode.ALPHANUMERIC:
          return new AlphanumericData(data);
        case Mode.KANJI:
          return new KanjiData(data);
        case Mode.BYTE:
          return new ByteData(data);
      }
    }
    exports2.fromArray = function fromArray(array) {
      return array.reduce(function(acc, seg) {
        if (typeof seg === "string") {
          acc.push(buildSingleSegment(seg, null));
        } else if (seg.data) {
          acc.push(buildSingleSegment(seg.data, seg.mode));
        }
        return acc;
      }, []);
    };
    exports2.fromString = function fromString(data, version) {
      const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());
      const nodes = buildNodes(segs);
      const graph = buildGraph(nodes, version);
      const path6 = dijkstra.find_path(graph.map, "start", "end");
      const optimizedSegs = [];
      for (let i = 1; i < path6.length - 1; i++) {
        optimizedSegs.push(graph.table[path6[i]].node);
      }
      return exports2.fromArray(mergeSegments(optimizedSegs));
    };
    exports2.rawSplit = function rawSplit(data) {
      return exports2.fromArray(
        getSegmentsFromString(data, Utils.isKanjiModeEnabled())
      );
    };
  }
});

// node_modules/qrcode/lib/core/qrcode.js
var require_qrcode = __commonJS({
  "node_modules/qrcode/lib/core/qrcode.js"(exports2) {
    var Utils = require_utils();
    var ECLevel = require_error_correction_level();
    var BitBuffer = require_bit_buffer();
    var BitMatrix = require_bit_matrix();
    var AlignmentPattern = require_alignment_pattern();
    var FinderPattern = require_finder_pattern();
    var MaskPattern = require_mask_pattern();
    var ECCode = require_error_correction_code();
    var ReedSolomonEncoder = require_reed_solomon_encoder();
    var Version = require_version();
    var FormatInfo = require_format_info();
    var Mode = require_mode();
    var Segments = require_segments();
    function setupFinderPattern(matrix, version) {
      const size = matrix.size;
      const pos = FinderPattern.getPositions(version);
      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];
        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || size <= row + r) continue;
          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || size <= col + c) continue;
            if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupTimingPattern(matrix) {
      const size = matrix.size;
      for (let r = 8; r < size - 8; r++) {
        const value = r % 2 === 0;
        matrix.set(r, 6, value, true);
        matrix.set(6, r, value, true);
      }
    }
    function setupAlignmentPattern(matrix, version) {
      const pos = AlignmentPattern.getPositions(version);
      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupVersionInfo(matrix, version) {
      const size = matrix.size;
      const bits = Version.getEncodedBits(version);
      let row, col, mod;
      for (let i = 0; i < 18; i++) {
        row = Math.floor(i / 3);
        col = i % 3 + size - 8 - 3;
        mod = (bits >> i & 1) === 1;
        matrix.set(row, col, mod, true);
        matrix.set(col, row, mod, true);
      }
    }
    function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
      const size = matrix.size;
      const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
      let i, mod;
      for (i = 0; i < 15; i++) {
        mod = (bits >> i & 1) === 1;
        if (i < 6) {
          matrix.set(i, 8, mod, true);
        } else if (i < 8) {
          matrix.set(i + 1, 8, mod, true);
        } else {
          matrix.set(size - 15 + i, 8, mod, true);
        }
        if (i < 8) {
          matrix.set(8, size - i - 1, mod, true);
        } else if (i < 9) {
          matrix.set(8, 15 - i - 1 + 1, mod, true);
        } else {
          matrix.set(8, 15 - i - 1, mod, true);
        }
      }
      matrix.set(size - 8, 8, 1, true);
    }
    function setupData(matrix, data) {
      const size = matrix.size;
      let inc = -1;
      let row = size - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (let c = 0; c < 2; c++) {
            if (!matrix.isReserved(row, col - c)) {
              let dark = false;
              if (byteIndex < data.length) {
                dark = (data[byteIndex] >>> bitIndex & 1) === 1;
              }
              matrix.set(row, col - c, dark);
              bitIndex--;
              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || size <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
    function createData(version, errorCorrectionLevel, segments) {
      const buffer = new BitBuffer();
      segments.forEach(function(data) {
        buffer.put(data.mode.bit, 4);
        buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));
        data.write(buffer);
      });
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 !== 0) {
        buffer.putBit(0);
      }
      const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
      for (let i = 0; i < remainingByte; i++) {
        buffer.put(i % 2 ? 17 : 236, 8);
      }
      return createCodewords(buffer, version, errorCorrectionLevel);
    }
    function createCodewords(bitBuffer, version, errorCorrectionLevel) {
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewords = totalCodewords - ecTotalCodewords;
      const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);
      const blocksInGroup2 = totalCodewords % ecTotalBlocks;
      const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
      const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
      const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
      const rs = new ReedSolomonEncoder(ecCount);
      let offset = 0;
      const dcData = new Array(ecTotalBlocks);
      const ecData = new Array(ecTotalBlocks);
      let maxDataSize = 0;
      const buffer = new Uint8Array(bitBuffer.buffer);
      for (let b = 0; b < ecTotalBlocks; b++) {
        const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
        dcData[b] = buffer.slice(offset, offset + dataSize);
        ecData[b] = rs.encode(dcData[b]);
        offset += dataSize;
        maxDataSize = Math.max(maxDataSize, dataSize);
      }
      const data = new Uint8Array(totalCodewords);
      let index = 0;
      let i, r;
      for (i = 0; i < maxDataSize; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          if (i < dcData[r].length) {
            data[index++] = dcData[r][i];
          }
        }
      }
      for (i = 0; i < ecCount; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          data[index++] = ecData[r][i];
        }
      }
      return data;
    }
    function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
      let segments;
      if (Array.isArray(data)) {
        segments = Segments.fromArray(data);
      } else if (typeof data === "string") {
        let estimatedVersion = version;
        if (!estimatedVersion) {
          const rawSegments = Segments.rawSplit(data);
          estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
        }
        segments = Segments.fromString(data, estimatedVersion || 40);
      } else {
        throw new Error("Invalid data");
      }
      const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
      if (!bestVersion) {
        throw new Error("The amount of data is too big to be stored in a QR Code");
      }
      if (!version) {
        version = bestVersion;
      } else if (version < bestVersion) {
        throw new Error(
          "\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n"
        );
      }
      const dataBits = createData(version, errorCorrectionLevel, segments);
      const moduleCount = Utils.getSymbolSize(version);
      const modules = new BitMatrix(moduleCount);
      setupFinderPattern(modules, version);
      setupTimingPattern(modules);
      setupAlignmentPattern(modules, version);
      setupFormatInfo(modules, errorCorrectionLevel, 0);
      if (version >= 7) {
        setupVersionInfo(modules, version);
      }
      setupData(modules, dataBits);
      if (isNaN(maskPattern)) {
        maskPattern = MaskPattern.getBestMask(
          modules,
          setupFormatInfo.bind(null, modules, errorCorrectionLevel)
        );
      }
      MaskPattern.applyMask(maskPattern, modules);
      setupFormatInfo(modules, errorCorrectionLevel, maskPattern);
      return {
        modules,
        version,
        errorCorrectionLevel,
        maskPattern,
        segments
      };
    }
    exports2.create = function create(data, options) {
      if (typeof data === "undefined" || data === "") {
        throw new Error("No input text");
      }
      let errorCorrectionLevel = ECLevel.M;
      let version;
      let mask;
      if (typeof options !== "undefined") {
        errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
        version = Version.from(options.version);
        mask = MaskPattern.from(options.maskPattern);
        if (options.toSJISFunc) {
          Utils.setToSJISFunction(options.toSJISFunc);
        }
      }
      return createSymbol(data, version, errorCorrectionLevel, mask);
    };
  }
});

// node_modules/pngjs/lib/chunkstream.js
var require_chunkstream = __commonJS({
  "node_modules/pngjs/lib/chunkstream.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var ChunkStream = module2.exports = function() {
      Stream.call(this);
      this._buffers = [];
      this._buffered = 0;
      this._reads = [];
      this._paused = false;
      this._encoding = "utf8";
      this.writable = true;
    };
    util.inherits(ChunkStream, Stream);
    ChunkStream.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
      process.nextTick(
        function() {
          this._process();
          if (this._paused && this._reads && this._reads.length > 0) {
            this._paused = false;
            this.emit("drain");
          }
        }.bind(this)
      );
    };
    ChunkStream.prototype.write = function(data, encoding) {
      if (!this.writable) {
        this.emit("error", new Error("Stream not writable"));
        return false;
      }
      let dataBuffer;
      if (Buffer.isBuffer(data)) {
        dataBuffer = data;
      } else {
        dataBuffer = Buffer.from(data, encoding || this._encoding);
      }
      this._buffers.push(dataBuffer);
      this._buffered += dataBuffer.length;
      this._process();
      if (this._reads && this._reads.length === 0) {
        this._paused = true;
      }
      return this.writable && !this._paused;
    };
    ChunkStream.prototype.end = function(data, encoding) {
      if (data) {
        this.write(data, encoding);
      }
      this.writable = false;
      if (!this._buffers) {
        return;
      }
      if (this._buffers.length === 0) {
        this._end();
      } else {
        this._buffers.push(null);
        this._process();
      }
    };
    ChunkStream.prototype.destroySoon = ChunkStream.prototype.end;
    ChunkStream.prototype._end = function() {
      if (this._reads.length > 0) {
        this.emit("error", new Error("Unexpected end of input"));
      }
      this.destroy();
    };
    ChunkStream.prototype.destroy = function() {
      if (!this._buffers) {
        return;
      }
      this.writable = false;
      this._reads = null;
      this._buffers = null;
      this.emit("close");
    };
    ChunkStream.prototype._processReadAllowingLess = function(read) {
      this._reads.shift();
      let smallerBuf = this._buffers[0];
      if (smallerBuf.length > read.length) {
        this._buffered -= read.length;
        this._buffers[0] = smallerBuf.slice(read.length);
        read.func.call(this, smallerBuf.slice(0, read.length));
      } else {
        this._buffered -= smallerBuf.length;
        this._buffers.shift();
        read.func.call(this, smallerBuf);
      }
    };
    ChunkStream.prototype._processRead = function(read) {
      this._reads.shift();
      let pos = 0;
      let count = 0;
      let data = Buffer.alloc(read.length);
      while (pos < read.length) {
        let buf = this._buffers[count++];
        let len = Math.min(buf.length, read.length - pos);
        buf.copy(data, pos, 0, len);
        pos += len;
        if (len !== buf.length) {
          this._buffers[--count] = buf.slice(len);
        }
      }
      if (count > 0) {
        this._buffers.splice(0, count);
      }
      this._buffered -= read.length;
      read.func.call(this, data);
    };
    ChunkStream.prototype._process = function() {
      try {
        while (this._buffered > 0 && this._reads && this._reads.length > 0) {
          let read = this._reads[0];
          if (read.allowLess) {
            this._processReadAllowingLess(read);
          } else if (this._buffered >= read.length) {
            this._processRead(read);
          } else {
            break;
          }
        }
        if (this._buffers && !this.writable) {
          this._end();
        }
      } catch (ex) {
        this.emit("error", ex);
      }
    };
  }
});

// node_modules/pngjs/lib/interlace.js
var require_interlace = __commonJS({
  "node_modules/pngjs/lib/interlace.js"(exports2) {
    "use strict";
    var imagePasses = [
      {
        // pass 1 - 1px
        x: [0],
        y: [0]
      },
      {
        // pass 2 - 1px
        x: [4],
        y: [0]
      },
      {
        // pass 3 - 2px
        x: [0, 4],
        y: [4]
      },
      {
        // pass 4 - 4px
        x: [2, 6],
        y: [0, 4]
      },
      {
        // pass 5 - 8px
        x: [0, 2, 4, 6],
        y: [2, 6]
      },
      {
        // pass 6 - 16px
        x: [1, 3, 5, 7],
        y: [0, 2, 4, 6]
      },
      {
        // pass 7 - 32px
        x: [0, 1, 2, 3, 4, 5, 6, 7],
        y: [1, 3, 5, 7]
      }
    ];
    exports2.getImagePasses = function(width, height) {
      let images = [];
      let xLeftOver = width % 8;
      let yLeftOver = height % 8;
      let xRepeats = (width - xLeftOver) / 8;
      let yRepeats = (height - yLeftOver) / 8;
      for (let i = 0; i < imagePasses.length; i++) {
        let pass = imagePasses[i];
        let passWidth = xRepeats * pass.x.length;
        let passHeight = yRepeats * pass.y.length;
        for (let j = 0; j < pass.x.length; j++) {
          if (pass.x[j] < xLeftOver) {
            passWidth++;
          } else {
            break;
          }
        }
        for (let j = 0; j < pass.y.length; j++) {
          if (pass.y[j] < yLeftOver) {
            passHeight++;
          } else {
            break;
          }
        }
        if (passWidth > 0 && passHeight > 0) {
          images.push({ width: passWidth, height: passHeight, index: i });
        }
      }
      return images;
    };
    exports2.getInterlaceIterator = function(width) {
      return function(x, y, pass) {
        let outerXLeftOver = x % imagePasses[pass].x.length;
        let outerX = (x - outerXLeftOver) / imagePasses[pass].x.length * 8 + imagePasses[pass].x[outerXLeftOver];
        let outerYLeftOver = y % imagePasses[pass].y.length;
        let outerY = (y - outerYLeftOver) / imagePasses[pass].y.length * 8 + imagePasses[pass].y[outerYLeftOver];
        return outerX * 4 + outerY * width * 4;
      };
    };
  }
});

// node_modules/pngjs/lib/paeth-predictor.js
var require_paeth_predictor = __commonJS({
  "node_modules/pngjs/lib/paeth-predictor.js"(exports2, module2) {
    "use strict";
    module2.exports = function paethPredictor(left, above, upLeft) {
      let paeth = left + above - upLeft;
      let pLeft = Math.abs(paeth - left);
      let pAbove = Math.abs(paeth - above);
      let pUpLeft = Math.abs(paeth - upLeft);
      if (pLeft <= pAbove && pLeft <= pUpLeft) {
        return left;
      }
      if (pAbove <= pUpLeft) {
        return above;
      }
      return upLeft;
    };
  }
});

// node_modules/pngjs/lib/filter-parse.js
var require_filter_parse = __commonJS({
  "node_modules/pngjs/lib/filter-parse.js"(exports2, module2) {
    "use strict";
    var interlaceUtils = require_interlace();
    var paethPredictor = require_paeth_predictor();
    function getByteWidth(width, bpp, depth) {
      let byteWidth = width * bpp;
      if (depth !== 8) {
        byteWidth = Math.ceil(byteWidth / (8 / depth));
      }
      return byteWidth;
    }
    var Filter = module2.exports = function(bitmapInfo, dependencies) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let interlace = bitmapInfo.interlace;
      let bpp = bitmapInfo.bpp;
      let depth = bitmapInfo.depth;
      this.read = dependencies.read;
      this.write = dependencies.write;
      this.complete = dependencies.complete;
      this._imageIndex = 0;
      this._images = [];
      if (interlace) {
        let passes = interlaceUtils.getImagePasses(width, height);
        for (let i = 0; i < passes.length; i++) {
          this._images.push({
            byteWidth: getByteWidth(passes[i].width, bpp, depth),
            height: passes[i].height,
            lineIndex: 0
          });
        }
      } else {
        this._images.push({
          byteWidth: getByteWidth(width, bpp, depth),
          height,
          lineIndex: 0
        });
      }
      if (depth === 8) {
        this._xComparison = bpp;
      } else if (depth === 16) {
        this._xComparison = bpp * 2;
      } else {
        this._xComparison = 1;
      }
    };
    Filter.prototype.start = function() {
      this.read(
        this._images[this._imageIndex].byteWidth + 1,
        this._reverseFilterLine.bind(this)
      );
    };
    Filter.prototype._unFilterType1 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f1Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        unfilteredLine[x] = rawByte + f1Left;
      }
    };
    Filter.prototype._unFilterType2 = function(rawData, unfilteredLine, byteWidth) {
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f2Up = lastLine ? lastLine[x] : 0;
        unfilteredLine[x] = rawByte + f2Up;
      }
    };
    Filter.prototype._unFilterType3 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f3Up = lastLine ? lastLine[x] : 0;
        let f3Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f3Add = Math.floor((f3Left + f3Up) / 2);
        unfilteredLine[x] = rawByte + f3Add;
      }
    };
    Filter.prototype._unFilterType4 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f4Up = lastLine ? lastLine[x] : 0;
        let f4Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f4UpLeft = x > xBiggerThan && lastLine ? lastLine[x - xComparison] : 0;
        let f4Add = paethPredictor(f4Left, f4Up, f4UpLeft);
        unfilteredLine[x] = rawByte + f4Add;
      }
    };
    Filter.prototype._reverseFilterLine = function(rawData) {
      let filter = rawData[0];
      let unfilteredLine;
      let currentImage = this._images[this._imageIndex];
      let byteWidth = currentImage.byteWidth;
      if (filter === 0) {
        unfilteredLine = rawData.slice(1, byteWidth + 1);
      } else {
        unfilteredLine = Buffer.alloc(byteWidth);
        switch (filter) {
          case 1:
            this._unFilterType1(rawData, unfilteredLine, byteWidth);
            break;
          case 2:
            this._unFilterType2(rawData, unfilteredLine, byteWidth);
            break;
          case 3:
            this._unFilterType3(rawData, unfilteredLine, byteWidth);
            break;
          case 4:
            this._unFilterType4(rawData, unfilteredLine, byteWidth);
            break;
          default:
            throw new Error("Unrecognised filter type - " + filter);
        }
      }
      this.write(unfilteredLine);
      currentImage.lineIndex++;
      if (currentImage.lineIndex >= currentImage.height) {
        this._lastLine = null;
        this._imageIndex++;
        currentImage = this._images[this._imageIndex];
      } else {
        this._lastLine = unfilteredLine;
      }
      if (currentImage) {
        this.read(currentImage.byteWidth + 1, this._reverseFilterLine.bind(this));
      } else {
        this._lastLine = null;
        this.complete();
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-async.js
var require_filter_parse_async = __commonJS({
  "node_modules/pngjs/lib/filter-parse-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var ChunkStream = require_chunkstream();
    var Filter = require_filter_parse();
    var FilterAsync = module2.exports = function(bitmapInfo) {
      ChunkStream.call(this);
      let buffers = [];
      let that = this;
      this._filter = new Filter(bitmapInfo, {
        read: this.read.bind(this),
        write: function(buffer) {
          buffers.push(buffer);
        },
        complete: function() {
          that.emit("complete", Buffer.concat(buffers));
        }
      });
      this._filter.start();
    };
    util.inherits(FilterAsync, ChunkStream);
  }
});

// node_modules/pngjs/lib/constants.js
var require_constants = __commonJS({
  "node_modules/pngjs/lib/constants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      PNG_SIGNATURE: [137, 80, 78, 71, 13, 10, 26, 10],
      TYPE_IHDR: 1229472850,
      TYPE_IEND: 1229278788,
      TYPE_IDAT: 1229209940,
      TYPE_PLTE: 1347179589,
      TYPE_tRNS: 1951551059,
      // eslint-disable-line camelcase
      TYPE_gAMA: 1732332865,
      // eslint-disable-line camelcase
      // color-type bits
      COLORTYPE_GRAYSCALE: 0,
      COLORTYPE_PALETTE: 1,
      COLORTYPE_COLOR: 2,
      COLORTYPE_ALPHA: 4,
      // e.g. grayscale and alpha
      // color-type combinations
      COLORTYPE_PALETTE_COLOR: 3,
      COLORTYPE_COLOR_ALPHA: 6,
      COLORTYPE_TO_BPP_MAP: {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
      },
      GAMMA_DIVISION: 1e5
    };
  }
});

// node_modules/pngjs/lib/crc.js
var require_crc = __commonJS({
  "node_modules/pngjs/lib/crc.js"(exports2, module2) {
    "use strict";
    var crcTable = [];
    (function() {
      for (let i = 0; i < 256; i++) {
        let currentCrc = i;
        for (let j = 0; j < 8; j++) {
          if (currentCrc & 1) {
            currentCrc = 3988292384 ^ currentCrc >>> 1;
          } else {
            currentCrc = currentCrc >>> 1;
          }
        }
        crcTable[i] = currentCrc;
      }
    })();
    var CrcCalculator = module2.exports = function() {
      this._crc = -1;
    };
    CrcCalculator.prototype.write = function(data) {
      for (let i = 0; i < data.length; i++) {
        this._crc = crcTable[(this._crc ^ data[i]) & 255] ^ this._crc >>> 8;
      }
      return true;
    };
    CrcCalculator.prototype.crc32 = function() {
      return this._crc ^ -1;
    };
    CrcCalculator.crc32 = function(buf) {
      let crc = -1;
      for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 255] ^ crc >>> 8;
      }
      return crc ^ -1;
    };
  }
});

// node_modules/pngjs/lib/parser.js
var require_parser = __commonJS({
  "node_modules/pngjs/lib/parser.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var CrcCalculator = require_crc();
    var Parser = module2.exports = function(options, dependencies) {
      this._options = options;
      options.checkCRC = options.checkCRC !== false;
      this._hasIHDR = false;
      this._hasIEND = false;
      this._emittedHeadersFinished = false;
      this._palette = [];
      this._colorType = 0;
      this._chunks = {};
      this._chunks[constants.TYPE_IHDR] = this._handleIHDR.bind(this);
      this._chunks[constants.TYPE_IEND] = this._handleIEND.bind(this);
      this._chunks[constants.TYPE_IDAT] = this._handleIDAT.bind(this);
      this._chunks[constants.TYPE_PLTE] = this._handlePLTE.bind(this);
      this._chunks[constants.TYPE_tRNS] = this._handleTRNS.bind(this);
      this._chunks[constants.TYPE_gAMA] = this._handleGAMA.bind(this);
      this.read = dependencies.read;
      this.error = dependencies.error;
      this.metadata = dependencies.metadata;
      this.gamma = dependencies.gamma;
      this.transColor = dependencies.transColor;
      this.palette = dependencies.palette;
      this.parsed = dependencies.parsed;
      this.inflateData = dependencies.inflateData;
      this.finished = dependencies.finished;
      this.simpleTransparency = dependencies.simpleTransparency;
      this.headersFinished = dependencies.headersFinished || function() {
      };
    };
    Parser.prototype.start = function() {
      this.read(constants.PNG_SIGNATURE.length, this._parseSignature.bind(this));
    };
    Parser.prototype._parseSignature = function(data) {
      let signature = constants.PNG_SIGNATURE;
      for (let i = 0; i < signature.length; i++) {
        if (data[i] !== signature[i]) {
          this.error(new Error("Invalid file signature"));
          return;
        }
      }
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._parseChunkBegin = function(data) {
      let length = data.readUInt32BE(0);
      let type = data.readUInt32BE(4);
      let name = "";
      for (let i = 4; i < 8; i++) {
        name += String.fromCharCode(data[i]);
      }
      let ancillary = Boolean(data[4] & 32);
      if (!this._hasIHDR && type !== constants.TYPE_IHDR) {
        this.error(new Error("Expected IHDR on beggining"));
        return;
      }
      this._crc = new CrcCalculator();
      this._crc.write(Buffer.from(name));
      if (this._chunks[type]) {
        return this._chunks[type](length);
      }
      if (!ancillary) {
        this.error(new Error("Unsupported critical chunk type " + name));
        return;
      }
      this.read(length + 4, this._skipChunk.bind(this));
    };
    Parser.prototype._skipChunk = function() {
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._handleChunkEnd = function() {
      this.read(4, this._parseChunkEnd.bind(this));
    };
    Parser.prototype._parseChunkEnd = function(data) {
      let fileCrc = data.readInt32BE(0);
      let calcCrc = this._crc.crc32();
      if (this._options.checkCRC && calcCrc !== fileCrc) {
        this.error(new Error("Crc error - " + fileCrc + " - " + calcCrc));
        return;
      }
      if (!this._hasIEND) {
        this.read(8, this._parseChunkBegin.bind(this));
      }
    };
    Parser.prototype._handleIHDR = function(length) {
      this.read(length, this._parseIHDR.bind(this));
    };
    Parser.prototype._parseIHDR = function(data) {
      this._crc.write(data);
      let width = data.readUInt32BE(0);
      let height = data.readUInt32BE(4);
      let depth = data[8];
      let colorType = data[9];
      let compr = data[10];
      let filter = data[11];
      let interlace = data[12];
      if (depth !== 8 && depth !== 4 && depth !== 2 && depth !== 1 && depth !== 16) {
        this.error(new Error("Unsupported bit depth " + depth));
        return;
      }
      if (!(colorType in constants.COLORTYPE_TO_BPP_MAP)) {
        this.error(new Error("Unsupported color type"));
        return;
      }
      if (compr !== 0) {
        this.error(new Error("Unsupported compression method"));
        return;
      }
      if (filter !== 0) {
        this.error(new Error("Unsupported filter method"));
        return;
      }
      if (interlace !== 0 && interlace !== 1) {
        this.error(new Error("Unsupported interlace method"));
        return;
      }
      this._colorType = colorType;
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._colorType];
      this._hasIHDR = true;
      this.metadata({
        width,
        height,
        depth,
        interlace: Boolean(interlace),
        palette: Boolean(colorType & constants.COLORTYPE_PALETTE),
        color: Boolean(colorType & constants.COLORTYPE_COLOR),
        alpha: Boolean(colorType & constants.COLORTYPE_ALPHA),
        bpp,
        colorType
      });
      this._handleChunkEnd();
    };
    Parser.prototype._handlePLTE = function(length) {
      this.read(length, this._parsePLTE.bind(this));
    };
    Parser.prototype._parsePLTE = function(data) {
      this._crc.write(data);
      let entries = Math.floor(data.length / 3);
      for (let i = 0; i < entries; i++) {
        this._palette.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2], 255]);
      }
      this.palette(this._palette);
      this._handleChunkEnd();
    };
    Parser.prototype._handleTRNS = function(length) {
      this.simpleTransparency();
      this.read(length, this._parseTRNS.bind(this));
    };
    Parser.prototype._parseTRNS = function(data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR) {
        if (this._palette.length === 0) {
          this.error(new Error("Transparency chunk must be after palette"));
          return;
        }
        if (data.length > this._palette.length) {
          this.error(new Error("More transparent colors than palette size"));
          return;
        }
        for (let i = 0; i < data.length; i++) {
          this._palette[i][3] = data[i];
        }
        this.palette(this._palette);
      }
      if (this._colorType === constants.COLORTYPE_GRAYSCALE) {
        this.transColor([data.readUInt16BE(0)]);
      }
      if (this._colorType === constants.COLORTYPE_COLOR) {
        this.transColor([
          data.readUInt16BE(0),
          data.readUInt16BE(2),
          data.readUInt16BE(4)
        ]);
      }
      this._handleChunkEnd();
    };
    Parser.prototype._handleGAMA = function(length) {
      this.read(length, this._parseGAMA.bind(this));
    };
    Parser.prototype._parseGAMA = function(data) {
      this._crc.write(data);
      this.gamma(data.readUInt32BE(0) / constants.GAMMA_DIVISION);
      this._handleChunkEnd();
    };
    Parser.prototype._handleIDAT = function(length) {
      if (!this._emittedHeadersFinished) {
        this._emittedHeadersFinished = true;
        this.headersFinished();
      }
      this.read(-length, this._parseIDAT.bind(this, length));
    };
    Parser.prototype._parseIDAT = function(length, data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR && this._palette.length === 0) {
        throw new Error("Expected palette not found");
      }
      this.inflateData(data);
      let leftOverLength = length - data.length;
      if (leftOverLength > 0) {
        this._handleIDAT(leftOverLength);
      } else {
        this._handleChunkEnd();
      }
    };
    Parser.prototype._handleIEND = function(length) {
      this.read(length, this._parseIEND.bind(this));
    };
    Parser.prototype._parseIEND = function(data) {
      this._crc.write(data);
      this._hasIEND = true;
      this._handleChunkEnd();
      if (this.finished) {
        this.finished();
      }
    };
  }
});

// node_modules/pngjs/lib/bitmapper.js
var require_bitmapper = __commonJS({
  "node_modules/pngjs/lib/bitmapper.js"(exports2) {
    "use strict";
    var interlaceUtils = require_interlace();
    var pixelBppMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos === data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = 255;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 1 >= data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = data[rawPos + 1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 2 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = 255;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 3 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = data[rawPos + 3];
      }
    ];
    var pixelBppCustomMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = maxBit;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, pixelData, pxPos) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = pixelData[1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = maxBit;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, pixelData, pxPos) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = pixelData[3];
      }
    ];
    function bitRetriever(data, depth) {
      let leftOver = [];
      let i = 0;
      function split() {
        if (i === data.length) {
          throw new Error("Ran out of data");
        }
        let byte = data[i];
        i++;
        let byte8, byte7, byte6, byte5, byte4, byte3, byte2, byte1;
        switch (depth) {
          default:
            throw new Error("unrecognised depth");
          case 16:
            byte2 = data[i];
            i++;
            leftOver.push((byte << 8) + byte2);
            break;
          case 4:
            byte2 = byte & 15;
            byte1 = byte >> 4;
            leftOver.push(byte1, byte2);
            break;
          case 2:
            byte4 = byte & 3;
            byte3 = byte >> 2 & 3;
            byte2 = byte >> 4 & 3;
            byte1 = byte >> 6 & 3;
            leftOver.push(byte1, byte2, byte3, byte4);
            break;
          case 1:
            byte8 = byte & 1;
            byte7 = byte >> 1 & 1;
            byte6 = byte >> 2 & 1;
            byte5 = byte >> 3 & 1;
            byte4 = byte >> 4 & 1;
            byte3 = byte >> 5 & 1;
            byte2 = byte >> 6 & 1;
            byte1 = byte >> 7 & 1;
            leftOver.push(byte1, byte2, byte3, byte4, byte5, byte6, byte7, byte8);
            break;
        }
      }
      return {
        get: function(count) {
          while (leftOver.length < count) {
            split();
          }
          let returner = leftOver.slice(0, count);
          leftOver = leftOver.slice(count);
          return returner;
        },
        resetAfterLine: function() {
          leftOver.length = 0;
        },
        end: function() {
          if (i !== data.length) {
            throw new Error("extra data found");
          }
        }
      };
    }
    function mapImage8Bit(image, pxData, getPxPos, bpp, data, rawPos) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppMapper[bpp](pxData, data, pxPos, rawPos);
          rawPos += bpp;
        }
      }
      return rawPos;
    }
    function mapImageCustomBit(image, pxData, getPxPos, bpp, bits, maxBit) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pixelData = bits.get(bpp);
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppCustomMapper[bpp](pxData, pixelData, pxPos, maxBit);
        }
        bits.resetAfterLine();
      }
    }
    exports2.dataToBitMap = function(data, bitmapInfo) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let depth = bitmapInfo.depth;
      let bpp = bitmapInfo.bpp;
      let interlace = bitmapInfo.interlace;
      let bits;
      if (depth !== 8) {
        bits = bitRetriever(data, depth);
      }
      let pxData;
      if (depth <= 8) {
        pxData = Buffer.alloc(width * height * 4);
      } else {
        pxData = new Uint16Array(width * height * 4);
      }
      let maxBit = Math.pow(2, depth) - 1;
      let rawPos = 0;
      let images;
      let getPxPos;
      if (interlace) {
        images = interlaceUtils.getImagePasses(width, height);
        getPxPos = interlaceUtils.getInterlaceIterator(width, height);
      } else {
        let nonInterlacedPxPos = 0;
        getPxPos = function() {
          let returner = nonInterlacedPxPos;
          nonInterlacedPxPos += 4;
          return returner;
        };
        images = [{ width, height }];
      }
      for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
        if (depth === 8) {
          rawPos = mapImage8Bit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            data,
            rawPos
          );
        } else {
          mapImageCustomBit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            bits,
            maxBit
          );
        }
      }
      if (depth === 8) {
        if (rawPos !== data.length) {
          throw new Error("extra data found");
        }
      } else {
        bits.end();
      }
      return pxData;
    };
  }
});

// node_modules/pngjs/lib/format-normaliser.js
var require_format_normaliser = __commonJS({
  "node_modules/pngjs/lib/format-normaliser.js"(exports2, module2) {
    "use strict";
    function dePalette(indata, outdata, width, height, palette) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let color = palette[indata[pxPos]];
          if (!color) {
            throw new Error("index " + indata[pxPos] + " not in palette");
          }
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = color[i];
          }
          pxPos += 4;
        }
      }
    }
    function replaceTransparentColor(indata, outdata, width, height, transColor) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let makeTrans = false;
          if (transColor.length === 1) {
            if (transColor[0] === indata[pxPos]) {
              makeTrans = true;
            }
          } else if (transColor[0] === indata[pxPos] && transColor[1] === indata[pxPos + 1] && transColor[2] === indata[pxPos + 2]) {
            makeTrans = true;
          }
          if (makeTrans) {
            for (let i = 0; i < 4; i++) {
              outdata[pxPos + i] = 0;
            }
          }
          pxPos += 4;
        }
      }
    }
    function scaleDepth(indata, outdata, width, height, depth) {
      let maxOutSample = 255;
      let maxInSample = Math.pow(2, depth) - 1;
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = Math.floor(
              indata[pxPos + i] * maxOutSample / maxInSample + 0.5
            );
          }
          pxPos += 4;
        }
      }
    }
    module2.exports = function(indata, imageData) {
      let depth = imageData.depth;
      let width = imageData.width;
      let height = imageData.height;
      let colorType = imageData.colorType;
      let transColor = imageData.transColor;
      let palette = imageData.palette;
      let outdata = indata;
      if (colorType === 3) {
        dePalette(indata, outdata, width, height, palette);
      } else {
        if (transColor) {
          replaceTransparentColor(indata, outdata, width, height, transColor);
        }
        if (depth !== 8) {
          if (depth === 16) {
            outdata = Buffer.alloc(width * height * 4);
          }
          scaleDepth(indata, outdata, width, height, depth);
        }
      }
      return outdata;
    };
  }
});

// node_modules/pngjs/lib/parser-async.js
var require_parser_async = __commonJS({
  "node_modules/pngjs/lib/parser-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var zlib = require("zlib");
    var ChunkStream = require_chunkstream();
    var FilterAsync = require_filter_parse_async();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    var ParserAsync = module2.exports = function(options) {
      ChunkStream.call(this);
      this._parser = new Parser(options, {
        read: this.read.bind(this),
        error: this._handleError.bind(this),
        metadata: this._handleMetaData.bind(this),
        gamma: this.emit.bind(this, "gamma"),
        palette: this._handlePalette.bind(this),
        transColor: this._handleTransColor.bind(this),
        finished: this._finished.bind(this),
        inflateData: this._inflateData.bind(this),
        simpleTransparency: this._simpleTransparency.bind(this),
        headersFinished: this._headersFinished.bind(this)
      });
      this._options = options;
      this.writable = true;
      this._parser.start();
    };
    util.inherits(ParserAsync, ChunkStream);
    ParserAsync.prototype._handleError = function(err) {
      this.emit("error", err);
      this.writable = false;
      this.destroy();
      if (this._inflate && this._inflate.destroy) {
        this._inflate.destroy();
      }
      if (this._filter) {
        this._filter.destroy();
        this._filter.on("error", function() {
        });
      }
      this.errord = true;
    };
    ParserAsync.prototype._inflateData = function(data) {
      if (!this._inflate) {
        if (this._bitmapInfo.interlace) {
          this._inflate = zlib.createInflate();
          this._inflate.on("error", this.emit.bind(this, "error"));
          this._filter.on("complete", this._complete.bind(this));
          this._inflate.pipe(this._filter);
        } else {
          let rowSize = (this._bitmapInfo.width * this._bitmapInfo.bpp * this._bitmapInfo.depth + 7 >> 3) + 1;
          let imageSize = rowSize * this._bitmapInfo.height;
          let chunkSize = Math.max(imageSize, zlib.Z_MIN_CHUNK);
          this._inflate = zlib.createInflate({ chunkSize });
          let leftToInflate = imageSize;
          let emitError = this.emit.bind(this, "error");
          this._inflate.on("error", function(err) {
            if (!leftToInflate) {
              return;
            }
            emitError(err);
          });
          this._filter.on("complete", this._complete.bind(this));
          let filterWrite = this._filter.write.bind(this._filter);
          this._inflate.on("data", function(chunk) {
            if (!leftToInflate) {
              return;
            }
            if (chunk.length > leftToInflate) {
              chunk = chunk.slice(0, leftToInflate);
            }
            leftToInflate -= chunk.length;
            filterWrite(chunk);
          });
          this._inflate.on("end", this._filter.end.bind(this._filter));
        }
      }
      this._inflate.write(data);
    };
    ParserAsync.prototype._handleMetaData = function(metaData) {
      this._metaData = metaData;
      this._bitmapInfo = Object.create(metaData);
      this._filter = new FilterAsync(this._bitmapInfo);
    };
    ParserAsync.prototype._handleTransColor = function(transColor) {
      this._bitmapInfo.transColor = transColor;
    };
    ParserAsync.prototype._handlePalette = function(palette) {
      this._bitmapInfo.palette = palette;
    };
    ParserAsync.prototype._simpleTransparency = function() {
      this._metaData.alpha = true;
    };
    ParserAsync.prototype._headersFinished = function() {
      this.emit("metadata", this._metaData);
    };
    ParserAsync.prototype._finished = function() {
      if (this.errord) {
        return;
      }
      if (!this._inflate) {
        this.emit("error", "No Inflate block");
      } else {
        this._inflate.end();
      }
    };
    ParserAsync.prototype._complete = function(filteredData) {
      if (this.errord) {
        return;
      }
      let normalisedBitmapData;
      try {
        let bitmapData = bitmapper.dataToBitMap(filteredData, this._bitmapInfo);
        normalisedBitmapData = formatNormaliser(bitmapData, this._bitmapInfo);
        bitmapData = null;
      } catch (ex) {
        this._handleError(ex);
        return;
      }
      this.emit("parsed", normalisedBitmapData);
    };
  }
});

// node_modules/pngjs/lib/bitpacker.js
var require_bitpacker = __commonJS({
  "node_modules/pngjs/lib/bitpacker.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    module2.exports = function(dataIn, width, height, options) {
      let outHasAlpha = [constants.COLORTYPE_COLOR_ALPHA, constants.COLORTYPE_ALPHA].indexOf(
        options.colorType
      ) !== -1;
      if (options.colorType === options.inputColorType) {
        let bigEndian = (function() {
          let buffer = new ArrayBuffer(2);
          new DataView(buffer).setInt16(
            0,
            256,
            true
            /* littleEndian */
          );
          return new Int16Array(buffer)[0] !== 256;
        })();
        if (options.bitDepth === 8 || options.bitDepth === 16 && bigEndian) {
          return dataIn;
        }
      }
      let data = options.bitDepth !== 16 ? dataIn : new Uint16Array(dataIn.buffer);
      let maxValue = 255;
      let inBpp = constants.COLORTYPE_TO_BPP_MAP[options.inputColorType];
      if (inBpp === 4 && !options.inputHasAlpha) {
        inBpp = 3;
      }
      let outBpp = constants.COLORTYPE_TO_BPP_MAP[options.colorType];
      if (options.bitDepth === 16) {
        maxValue = 65535;
        outBpp *= 2;
      }
      let outData = Buffer.alloc(width * height * outBpp);
      let inIndex = 0;
      let outIndex = 0;
      let bgColor = options.bgColor || {};
      if (bgColor.red === void 0) {
        bgColor.red = maxValue;
      }
      if (bgColor.green === void 0) {
        bgColor.green = maxValue;
      }
      if (bgColor.blue === void 0) {
        bgColor.blue = maxValue;
      }
      function getRGBA() {
        let red;
        let green;
        let blue;
        let alpha = maxValue;
        switch (options.inputColorType) {
          case constants.COLORTYPE_COLOR_ALPHA:
            alpha = data[inIndex + 3];
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_COLOR:
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_ALPHA:
            alpha = data[inIndex + 1];
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          case constants.COLORTYPE_GRAYSCALE:
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          default:
            throw new Error(
              "input color type:" + options.inputColorType + " is not supported at present"
            );
        }
        if (options.inputHasAlpha) {
          if (!outHasAlpha) {
            alpha /= maxValue;
            red = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.red + alpha * red), 0),
              maxValue
            );
            green = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.green + alpha * green), 0),
              maxValue
            );
            blue = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.blue + alpha * blue), 0),
              maxValue
            );
          }
        }
        return { red, green, blue, alpha };
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let rgba = getRGBA(data, inIndex);
          switch (options.colorType) {
            case constants.COLORTYPE_COLOR_ALPHA:
            case constants.COLORTYPE_COLOR:
              if (options.bitDepth === 8) {
                outData[outIndex] = rgba.red;
                outData[outIndex + 1] = rgba.green;
                outData[outIndex + 2] = rgba.blue;
                if (outHasAlpha) {
                  outData[outIndex + 3] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(rgba.red, outIndex);
                outData.writeUInt16BE(rgba.green, outIndex + 2);
                outData.writeUInt16BE(rgba.blue, outIndex + 4);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 6);
                }
              }
              break;
            case constants.COLORTYPE_ALPHA:
            case constants.COLORTYPE_GRAYSCALE: {
              let grayscale = (rgba.red + rgba.green + rgba.blue) / 3;
              if (options.bitDepth === 8) {
                outData[outIndex] = grayscale;
                if (outHasAlpha) {
                  outData[outIndex + 1] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(grayscale, outIndex);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 2);
                }
              }
              break;
            }
            default:
              throw new Error("unrecognised color Type " + options.colorType);
          }
          inIndex += inBpp;
          outIndex += outBpp;
        }
      }
      return outData;
    };
  }
});

// node_modules/pngjs/lib/filter-pack.js
var require_filter_pack = __commonJS({
  "node_modules/pngjs/lib/filter-pack.js"(exports2, module2) {
    "use strict";
    var paethPredictor = require_paeth_predictor();
    function filterNone(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        rawData[rawPos + x] = pxData[pxPos + x];
      }
    }
    function filterSumNone(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let i = pxPos; i < length; i++) {
        sum += Math.abs(pxData[i]);
      }
      return sum;
    }
    function filterSub(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumSub(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterUp(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - up;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumUp(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let x = pxPos; x < length; x++) {
        let up = pxPos > 0 ? pxData[x - byteWidth] : 0;
        let val = pxData[x] - up;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterAvg(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumAvg(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterPaeth(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumPaeth(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        sum += Math.abs(val);
      }
      return sum;
    }
    var filters = {
      0: filterNone,
      1: filterSub,
      2: filterUp,
      3: filterAvg,
      4: filterPaeth
    };
    var filterSums = {
      0: filterSumNone,
      1: filterSumSub,
      2: filterSumUp,
      3: filterSumAvg,
      4: filterSumPaeth
    };
    module2.exports = function(pxData, width, height, options, bpp) {
      let filterTypes;
      if (!("filterType" in options) || options.filterType === -1) {
        filterTypes = [0, 1, 2, 3, 4];
      } else if (typeof options.filterType === "number") {
        filterTypes = [options.filterType];
      } else {
        throw new Error("unrecognised filter types");
      }
      if (options.bitDepth === 16) {
        bpp *= 2;
      }
      let byteWidth = width * bpp;
      let rawPos = 0;
      let pxPos = 0;
      let rawData = Buffer.alloc((byteWidth + 1) * height);
      let sel = filterTypes[0];
      for (let y = 0; y < height; y++) {
        if (filterTypes.length > 1) {
          let min = Infinity;
          for (let i = 0; i < filterTypes.length; i++) {
            let sum = filterSums[filterTypes[i]](pxData, pxPos, byteWidth, bpp);
            if (sum < min) {
              sel = filterTypes[i];
              min = sum;
            }
          }
        }
        rawData[rawPos] = sel;
        rawPos++;
        filters[sel](pxData, pxPos, byteWidth, rawData, rawPos, bpp);
        rawPos += byteWidth;
        pxPos += byteWidth;
      }
      return rawData;
    };
  }
});

// node_modules/pngjs/lib/packer.js
var require_packer = __commonJS({
  "node_modules/pngjs/lib/packer.js"(exports2, module2) {
    "use strict";
    var constants = require_constants();
    var CrcStream = require_crc();
    var bitPacker = require_bitpacker();
    var filter = require_filter_pack();
    var zlib = require("zlib");
    var Packer = module2.exports = function(options) {
      this._options = options;
      options.deflateChunkSize = options.deflateChunkSize || 32 * 1024;
      options.deflateLevel = options.deflateLevel != null ? options.deflateLevel : 9;
      options.deflateStrategy = options.deflateStrategy != null ? options.deflateStrategy : 3;
      options.inputHasAlpha = options.inputHasAlpha != null ? options.inputHasAlpha : true;
      options.deflateFactory = options.deflateFactory || zlib.createDeflate;
      options.bitDepth = options.bitDepth || 8;
      options.colorType = typeof options.colorType === "number" ? options.colorType : constants.COLORTYPE_COLOR_ALPHA;
      options.inputColorType = typeof options.inputColorType === "number" ? options.inputColorType : constants.COLORTYPE_COLOR_ALPHA;
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.colorType) === -1) {
        throw new Error(
          "option color type:" + options.colorType + " is not supported at present"
        );
      }
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.inputColorType) === -1) {
        throw new Error(
          "option input color type:" + options.inputColorType + " is not supported at present"
        );
      }
      if (options.bitDepth !== 8 && options.bitDepth !== 16) {
        throw new Error(
          "option bit depth:" + options.bitDepth + " is not supported at present"
        );
      }
    };
    Packer.prototype.getDeflateOptions = function() {
      return {
        chunkSize: this._options.deflateChunkSize,
        level: this._options.deflateLevel,
        strategy: this._options.deflateStrategy
      };
    };
    Packer.prototype.createDeflate = function() {
      return this._options.deflateFactory(this.getDeflateOptions());
    };
    Packer.prototype.filterData = function(data, width, height) {
      let packedData = bitPacker(data, width, height, this._options);
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._options.colorType];
      let filteredData = filter(packedData, width, height, this._options, bpp);
      return filteredData;
    };
    Packer.prototype._packChunk = function(type, data) {
      let len = data ? data.length : 0;
      let buf = Buffer.alloc(len + 12);
      buf.writeUInt32BE(len, 0);
      buf.writeUInt32BE(type, 4);
      if (data) {
        data.copy(buf, 8);
      }
      buf.writeInt32BE(
        CrcStream.crc32(buf.slice(4, buf.length - 4)),
        buf.length - 4
      );
      return buf;
    };
    Packer.prototype.packGAMA = function(gamma) {
      let buf = Buffer.alloc(4);
      buf.writeUInt32BE(Math.floor(gamma * constants.GAMMA_DIVISION), 0);
      return this._packChunk(constants.TYPE_gAMA, buf);
    };
    Packer.prototype.packIHDR = function(width, height) {
      let buf = Buffer.alloc(13);
      buf.writeUInt32BE(width, 0);
      buf.writeUInt32BE(height, 4);
      buf[8] = this._options.bitDepth;
      buf[9] = this._options.colorType;
      buf[10] = 0;
      buf[11] = 0;
      buf[12] = 0;
      return this._packChunk(constants.TYPE_IHDR, buf);
    };
    Packer.prototype.packIDAT = function(data) {
      return this._packChunk(constants.TYPE_IDAT, data);
    };
    Packer.prototype.packIEND = function() {
      return this._packChunk(constants.TYPE_IEND, null);
    };
  }
});

// node_modules/pngjs/lib/packer-async.js
var require_packer_async = __commonJS({
  "node_modules/pngjs/lib/packer-async.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var constants = require_constants();
    var Packer = require_packer();
    var PackerAsync = module2.exports = function(opt) {
      Stream.call(this);
      let options = opt || {};
      this._packer = new Packer(options);
      this._deflate = this._packer.createDeflate();
      this.readable = true;
    };
    util.inherits(PackerAsync, Stream);
    PackerAsync.prototype.pack = function(data, width, height, gamma) {
      this.emit("data", Buffer.from(constants.PNG_SIGNATURE));
      this.emit("data", this._packer.packIHDR(width, height));
      if (gamma) {
        this.emit("data", this._packer.packGAMA(gamma));
      }
      let filteredData = this._packer.filterData(data, width, height);
      this._deflate.on("error", this.emit.bind(this, "error"));
      this._deflate.on(
        "data",
        function(compressedData) {
          this.emit("data", this._packer.packIDAT(compressedData));
        }.bind(this)
      );
      this._deflate.on(
        "end",
        function() {
          this.emit("data", this._packer.packIEND());
          this.emit("end");
        }.bind(this)
      );
      this._deflate.end(filteredData);
    };
  }
});

// node_modules/pngjs/lib/sync-inflate.js
var require_sync_inflate = __commonJS({
  "node_modules/pngjs/lib/sync-inflate.js"(exports2, module2) {
    "use strict";
    var assert = require("assert").ok;
    var zlib = require("zlib");
    var util = require("util");
    var kMaxLength = require("buffer").kMaxLength;
    function Inflate(opts) {
      if (!(this instanceof Inflate)) {
        return new Inflate(opts);
      }
      if (opts && opts.chunkSize < zlib.Z_MIN_CHUNK) {
        opts.chunkSize = zlib.Z_MIN_CHUNK;
      }
      zlib.Inflate.call(this, opts);
      this._offset = this._offset === void 0 ? this._outOffset : this._offset;
      this._buffer = this._buffer || this._outBuffer;
      if (opts && opts.maxLength != null) {
        this._maxLength = opts.maxLength;
      }
    }
    function createInflate(opts) {
      return new Inflate(opts);
    }
    function _close(engine, callback) {
      if (callback) {
        process.nextTick(callback);
      }
      if (!engine._handle) {
        return;
      }
      engine._handle.close();
      engine._handle = null;
    }
    Inflate.prototype._processChunk = function(chunk, flushFlag, asyncCb) {
      if (typeof asyncCb === "function") {
        return zlib.Inflate._processChunk.call(this, chunk, flushFlag, asyncCb);
      }
      let self = this;
      let availInBefore = chunk && chunk.length;
      let availOutBefore = this._chunkSize - this._offset;
      let leftToInflate = this._maxLength;
      let inOff = 0;
      let buffers = [];
      let nread = 0;
      let error;
      this.on("error", function(err) {
        error = err;
      });
      function handleChunk(availInAfter, availOutAfter) {
        if (self._hadError) {
          return;
        }
        let have = availOutBefore - availOutAfter;
        assert(have >= 0, "have should not go down");
        if (have > 0) {
          let out = self._buffer.slice(self._offset, self._offset + have);
          self._offset += have;
          if (out.length > leftToInflate) {
            out = out.slice(0, leftToInflate);
          }
          buffers.push(out);
          nread += out.length;
          leftToInflate -= out.length;
          if (leftToInflate === 0) {
            return false;
          }
        }
        if (availOutAfter === 0 || self._offset >= self._chunkSize) {
          availOutBefore = self._chunkSize;
          self._offset = 0;
          self._buffer = Buffer.allocUnsafe(self._chunkSize);
        }
        if (availOutAfter === 0) {
          inOff += availInBefore - availInAfter;
          availInBefore = availInAfter;
          return true;
        }
        return false;
      }
      assert(this._handle, "zlib binding closed");
      let res;
      do {
        res = this._handle.writeSync(
          flushFlag,
          chunk,
          // in
          inOff,
          // in_off
          availInBefore,
          // in_len
          this._buffer,
          // out
          this._offset,
          //out_off
          availOutBefore
        );
        res = res || this._writeState;
      } while (!this._hadError && handleChunk(res[0], res[1]));
      if (this._hadError) {
        throw error;
      }
      if (nread >= kMaxLength) {
        _close(this);
        throw new RangeError(
          "Cannot create final Buffer. It would be larger than 0x" + kMaxLength.toString(16) + " bytes"
        );
      }
      let buf = Buffer.concat(buffers, nread);
      _close(this);
      return buf;
    };
    util.inherits(Inflate, zlib.Inflate);
    function zlibBufferSync(engine, buffer) {
      if (typeof buffer === "string") {
        buffer = Buffer.from(buffer);
      }
      if (!(buffer instanceof Buffer)) {
        throw new TypeError("Not a string or buffer");
      }
      let flushFlag = engine._finishFlushFlag;
      if (flushFlag == null) {
        flushFlag = zlib.Z_FINISH;
      }
      return engine._processChunk(buffer, flushFlag);
    }
    function inflateSync(buffer, opts) {
      return zlibBufferSync(new Inflate(opts), buffer);
    }
    module2.exports = exports2 = inflateSync;
    exports2.Inflate = Inflate;
    exports2.createInflate = createInflate;
    exports2.inflateSync = inflateSync;
  }
});

// node_modules/pngjs/lib/sync-reader.js
var require_sync_reader = __commonJS({
  "node_modules/pngjs/lib/sync-reader.js"(exports2, module2) {
    "use strict";
    var SyncReader = module2.exports = function(buffer) {
      this._buffer = buffer;
      this._reads = [];
    };
    SyncReader.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
    };
    SyncReader.prototype.process = function() {
      while (this._reads.length > 0 && this._buffer.length) {
        let read = this._reads[0];
        if (this._buffer.length && (this._buffer.length >= read.length || read.allowLess)) {
          this._reads.shift();
          let buf = this._buffer;
          this._buffer = buf.slice(read.length);
          read.func.call(this, buf.slice(0, read.length));
        } else {
          break;
        }
      }
      if (this._reads.length > 0) {
        return new Error("There are some read requests waitng on finished stream");
      }
      if (this._buffer.length > 0) {
        return new Error("unrecognised content at end of stream");
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-sync.js
var require_filter_parse_sync = __commonJS({
  "node_modules/pngjs/lib/filter-parse-sync.js"(exports2) {
    "use strict";
    var SyncReader = require_sync_reader();
    var Filter = require_filter_parse();
    exports2.process = function(inBuffer, bitmapInfo) {
      let outBuffers = [];
      let reader = new SyncReader(inBuffer);
      let filter = new Filter(bitmapInfo, {
        read: reader.read.bind(reader),
        write: function(bufferPart) {
          outBuffers.push(bufferPart);
        },
        complete: function() {
        }
      });
      filter.start();
      reader.process();
      return Buffer.concat(outBuffers);
    };
  }
});

// node_modules/pngjs/lib/parser-sync.js
var require_parser_sync = __commonJS({
  "node_modules/pngjs/lib/parser-sync.js"(exports2, module2) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = require("zlib");
    var inflateSync = require_sync_inflate();
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var SyncReader = require_sync_reader();
    var FilterSync = require_filter_parse_sync();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    module2.exports = function(buffer, options) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let err;
      function handleError(_err_) {
        err = _err_;
      }
      let metaData;
      function handleMetaData(_metaData_) {
        metaData = _metaData_;
      }
      function handleTransColor(transColor) {
        metaData.transColor = transColor;
      }
      function handlePalette(palette) {
        metaData.palette = palette;
      }
      function handleSimpleTransparency() {
        metaData.alpha = true;
      }
      let gamma;
      function handleGamma(_gamma_) {
        gamma = _gamma_;
      }
      let inflateDataList = [];
      function handleInflateData(inflatedData2) {
        inflateDataList.push(inflatedData2);
      }
      let reader = new SyncReader(buffer);
      let parser = new Parser(options, {
        read: reader.read.bind(reader),
        error: handleError,
        metadata: handleMetaData,
        gamma: handleGamma,
        palette: handlePalette,
        transColor: handleTransColor,
        inflateData: handleInflateData,
        simpleTransparency: handleSimpleTransparency
      });
      parser.start();
      reader.process();
      if (err) {
        throw err;
      }
      let inflateData = Buffer.concat(inflateDataList);
      inflateDataList.length = 0;
      let inflatedData;
      if (metaData.interlace) {
        inflatedData = zlib.inflateSync(inflateData);
      } else {
        let rowSize = (metaData.width * metaData.bpp * metaData.depth + 7 >> 3) + 1;
        let imageSize = rowSize * metaData.height;
        inflatedData = inflateSync(inflateData, {
          chunkSize: imageSize,
          maxLength: imageSize
        });
      }
      inflateData = null;
      if (!inflatedData || !inflatedData.length) {
        throw new Error("bad png - invalid inflate data response");
      }
      let unfilteredData = FilterSync.process(inflatedData, metaData);
      inflateData = null;
      let bitmapData = bitmapper.dataToBitMap(unfilteredData, metaData);
      unfilteredData = null;
      let normalisedBitmapData = formatNormaliser(bitmapData, metaData);
      metaData.data = normalisedBitmapData;
      metaData.gamma = gamma || 0;
      return metaData;
    };
  }
});

// node_modules/pngjs/lib/packer-sync.js
var require_packer_sync = __commonJS({
  "node_modules/pngjs/lib/packer-sync.js"(exports2, module2) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = require("zlib");
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var constants = require_constants();
    var Packer = require_packer();
    module2.exports = function(metaData, opt) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let options = opt || {};
      let packer = new Packer(options);
      let chunks = [];
      chunks.push(Buffer.from(constants.PNG_SIGNATURE));
      chunks.push(packer.packIHDR(metaData.width, metaData.height));
      if (metaData.gamma) {
        chunks.push(packer.packGAMA(metaData.gamma));
      }
      let filteredData = packer.filterData(
        metaData.data,
        metaData.width,
        metaData.height
      );
      let compressedData = zlib.deflateSync(
        filteredData,
        packer.getDeflateOptions()
      );
      filteredData = null;
      if (!compressedData || !compressedData.length) {
        throw new Error("bad png - invalid compressed data response");
      }
      chunks.push(packer.packIDAT(compressedData));
      chunks.push(packer.packIEND());
      return Buffer.concat(chunks);
    };
  }
});

// node_modules/pngjs/lib/png-sync.js
var require_png_sync = __commonJS({
  "node_modules/pngjs/lib/png-sync.js"(exports2) {
    "use strict";
    var parse = require_parser_sync();
    var pack = require_packer_sync();
    exports2.read = function(buffer, options) {
      return parse(buffer, options || {});
    };
    exports2.write = function(png, options) {
      return pack(png, options);
    };
  }
});

// node_modules/pngjs/lib/png.js
var require_png = __commonJS({
  "node_modules/pngjs/lib/png.js"(exports2) {
    "use strict";
    var util = require("util");
    var Stream = require("stream");
    var Parser = require_parser_async();
    var Packer = require_packer_async();
    var PNGSync = require_png_sync();
    var PNG = exports2.PNG = function(options) {
      Stream.call(this);
      options = options || {};
      this.width = options.width | 0;
      this.height = options.height | 0;
      this.data = this.width > 0 && this.height > 0 ? Buffer.alloc(4 * this.width * this.height) : null;
      if (options.fill && this.data) {
        this.data.fill(0);
      }
      this.gamma = 0;
      this.readable = this.writable = true;
      this._parser = new Parser(options);
      this._parser.on("error", this.emit.bind(this, "error"));
      this._parser.on("close", this._handleClose.bind(this));
      this._parser.on("metadata", this._metadata.bind(this));
      this._parser.on("gamma", this._gamma.bind(this));
      this._parser.on(
        "parsed",
        function(data) {
          this.data = data;
          this.emit("parsed", data);
        }.bind(this)
      );
      this._packer = new Packer(options);
      this._packer.on("data", this.emit.bind(this, "data"));
      this._packer.on("end", this.emit.bind(this, "end"));
      this._parser.on("close", this._handleClose.bind(this));
      this._packer.on("error", this.emit.bind(this, "error"));
    };
    util.inherits(PNG, Stream);
    PNG.sync = PNGSync;
    PNG.prototype.pack = function() {
      if (!this.data || !this.data.length) {
        this.emit("error", "No data provided");
        return this;
      }
      process.nextTick(
        function() {
          this._packer.pack(this.data, this.width, this.height, this.gamma);
        }.bind(this)
      );
      return this;
    };
    PNG.prototype.parse = function(data, callback) {
      if (callback) {
        let onParsed, onError;
        onParsed = function(parsedData) {
          this.removeListener("error", onError);
          this.data = parsedData;
          callback(null, this);
        }.bind(this);
        onError = function(err) {
          this.removeListener("parsed", onParsed);
          callback(err, null);
        }.bind(this);
        this.once("parsed", onParsed);
        this.once("error", onError);
      }
      this.end(data);
      return this;
    };
    PNG.prototype.write = function(data) {
      this._parser.write(data);
      return true;
    };
    PNG.prototype.end = function(data) {
      this._parser.end(data);
    };
    PNG.prototype._metadata = function(metadata) {
      this.width = metadata.width;
      this.height = metadata.height;
      this.emit("metadata", metadata);
    };
    PNG.prototype._gamma = function(gamma) {
      this.gamma = gamma;
    };
    PNG.prototype._handleClose = function() {
      if (!this._parser.writable && !this._packer.readable) {
        this.emit("close");
      }
    };
    PNG.bitblt = function(src, dst, srcX, srcY, width, height, deltaX, deltaY) {
      srcX |= 0;
      srcY |= 0;
      width |= 0;
      height |= 0;
      deltaX |= 0;
      deltaY |= 0;
      if (srcX > src.width || srcY > src.height || srcX + width > src.width || srcY + height > src.height) {
        throw new Error("bitblt reading outside image");
      }
      if (deltaX > dst.width || deltaY > dst.height || deltaX + width > dst.width || deltaY + height > dst.height) {
        throw new Error("bitblt writing outside image");
      }
      for (let y = 0; y < height; y++) {
        src.data.copy(
          dst.data,
          (deltaY + y) * dst.width + deltaX << 2,
          (srcY + y) * src.width + srcX << 2,
          (srcY + y) * src.width + srcX + width << 2
        );
      }
    };
    PNG.prototype.bitblt = function(dst, srcX, srcY, width, height, deltaX, deltaY) {
      PNG.bitblt(this, dst, srcX, srcY, width, height, deltaX, deltaY);
      return this;
    };
    PNG.adjustGamma = function(src) {
      if (src.gamma) {
        for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            let idx = src.width * y + x << 2;
            for (let i = 0; i < 3; i++) {
              let sample = src.data[idx + i] / 255;
              sample = Math.pow(sample, 1 / 2.2 / src.gamma);
              src.data[idx + i] = Math.round(sample * 255);
            }
          }
        }
        src.gamma = 0;
      }
    };
    PNG.prototype.adjustGamma = function() {
      PNG.adjustGamma(this);
    };
  }
});

// node_modules/qrcode/lib/renderer/utils.js
var require_utils2 = __commonJS({
  "node_modules/qrcode/lib/renderer/utils.js"(exports2) {
    function hex2rgba(hex) {
      if (typeof hex === "number") {
        hex = hex.toString();
      }
      if (typeof hex !== "string") {
        throw new Error("Color should be defined as hex string");
      }
      let hexCode = hex.slice().replace("#", "").split("");
      if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
        throw new Error("Invalid hex color: " + hex);
      }
      if (hexCode.length === 3 || hexCode.length === 4) {
        hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }));
      }
      if (hexCode.length === 6) hexCode.push("F", "F");
      const hexValue = parseInt(hexCode.join(""), 16);
      return {
        r: hexValue >> 24 & 255,
        g: hexValue >> 16 & 255,
        b: hexValue >> 8 & 255,
        a: hexValue & 255,
        hex: "#" + hexCode.slice(0, 6).join("")
      };
    }
    exports2.getOptions = function getOptions(options) {
      if (!options) options = {};
      if (!options.color) options.color = {};
      const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
      const width = options.width && options.width >= 21 ? options.width : void 0;
      const scale = options.scale || 4;
      return {
        width,
        scale: width ? 4 : scale,
        margin,
        color: {
          dark: hex2rgba(options.color.dark || "#000000ff"),
          light: hex2rgba(options.color.light || "#ffffffff")
        },
        type: options.type,
        rendererOpts: options.rendererOpts || {}
      };
    };
    exports2.getScale = function getScale(qrSize, opts) {
      return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
    };
    exports2.getImageWidth = function getImageWidth(qrSize, opts) {
      const scale = exports2.getScale(qrSize, opts);
      return Math.floor((qrSize + opts.margin * 2) * scale);
    };
    exports2.qrToImageData = function qrToImageData(imgData, qr, opts) {
      const size = qr.modules.size;
      const data = qr.modules.data;
      const scale = exports2.getScale(size, opts);
      const symbolSize = Math.floor((size + opts.margin * 2) * scale);
      const scaledMargin = opts.margin * scale;
      const palette = [opts.color.light, opts.color.dark];
      for (let i = 0; i < symbolSize; i++) {
        for (let j = 0; j < symbolSize; j++) {
          let posDst = (i * symbolSize + j) * 4;
          let pxColor = opts.color.light;
          if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
            const iSrc = Math.floor((i - scaledMargin) / scale);
            const jSrc = Math.floor((j - scaledMargin) / scale);
            pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
          }
          imgData[posDst++] = pxColor.r;
          imgData[posDst++] = pxColor.g;
          imgData[posDst++] = pxColor.b;
          imgData[posDst] = pxColor.a;
        }
      }
    };
  }
});

// node_modules/qrcode/lib/renderer/png.js
var require_png2 = __commonJS({
  "node_modules/qrcode/lib/renderer/png.js"(exports2) {
    var fs8 = require("fs");
    var PNG = require_png().PNG;
    var Utils = require_utils2();
    exports2.render = function render(qrData, options) {
      const opts = Utils.getOptions(options);
      const pngOpts = opts.rendererOpts;
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      pngOpts.width = size;
      pngOpts.height = size;
      const pngImage = new PNG(pngOpts);
      Utils.qrToImageData(pngImage.data, qrData, opts);
      return pngImage;
    };
    exports2.renderToDataURL = function renderToDataURL(qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      exports2.renderToBuffer(qrData, options, function(err, output) {
        if (err) cb(err);
        let url = "data:image/png;base64,";
        url += output.toString("base64");
        cb(null, url);
      });
    };
    exports2.renderToBuffer = function renderToBuffer(qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const png = exports2.render(qrData, options);
      const buffer = [];
      png.on("error", cb);
      png.on("data", function(data) {
        buffer.push(data);
      });
      png.on("end", function() {
        cb(null, Buffer.concat(buffer));
      });
      png.pack();
    };
    exports2.renderToFile = function renderToFile(path6, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      let called = false;
      const done = (...args) => {
        if (called) return;
        called = true;
        cb.apply(null, args);
      };
      const stream = fs8.createWriteStream(path6);
      stream.on("error", done);
      stream.on("close", done);
      exports2.renderToFileStream(stream, qrData, options);
    };
    exports2.renderToFileStream = function renderToFileStream(stream, qrData, options) {
      const png = exports2.render(qrData, options);
      png.pack().pipe(stream);
    };
  }
});

// node_modules/qrcode/lib/renderer/utf8.js
var require_utf8 = __commonJS({
  "node_modules/qrcode/lib/renderer/utf8.js"(exports2) {
    var Utils = require_utils2();
    var BLOCK_CHAR = {
      WW: " ",
      WB: "\u2584",
      BB: "\u2588",
      BW: "\u2580"
    };
    var INVERTED_BLOCK_CHAR = {
      BB: " ",
      BW: "\u2584",
      WW: "\u2588",
      WB: "\u2580"
    };
    function getBlockChar(top, bottom, blocks) {
      if (top && bottom) return blocks.BB;
      if (top && !bottom) return blocks.BW;
      if (!top && bottom) return blocks.WB;
      return blocks.WW;
    }
    exports2.render = function(qrData, options, cb) {
      const opts = Utils.getOptions(options);
      let blocks = BLOCK_CHAR;
      if (opts.color.dark.hex === "#ffffff" || opts.color.light.hex === "#000000") {
        blocks = INVERTED_BLOCK_CHAR;
      }
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      let output = "";
      let hMargin = Array(size + opts.margin * 2 + 1).join(blocks.WW);
      hMargin = Array(opts.margin / 2 + 1).join(hMargin + "\n");
      const vMargin = Array(opts.margin + 1).join(blocks.WW);
      output += hMargin;
      for (let i = 0; i < size; i += 2) {
        output += vMargin;
        for (let j = 0; j < size; j++) {
          const topModule = data[i * size + j];
          const bottomModule = data[(i + 1) * size + j];
          output += getBlockChar(topModule, bottomModule, blocks);
        }
        output += vMargin + "\n";
      }
      output += hMargin.slice(0, -1);
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
    exports2.renderToFile = function renderToFile(path6, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const fs8 = require("fs");
      const utf8 = exports2.render(qrData, options);
      fs8.writeFile(path6, utf8, cb);
    };
  }
});

// node_modules/qrcode/lib/renderer/terminal/terminal.js
var require_terminal = __commonJS({
  "node_modules/qrcode/lib/renderer/terminal/terminal.js"(exports2) {
    exports2.render = function(qrData, options, cb) {
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const black = "\x1B[40m  \x1B[0m";
      const white = "\x1B[47m  \x1B[0m";
      let output = "";
      const hMargin = Array(size + 3).join(white);
      const vMargin = Array(2).join(white);
      output += hMargin + "\n";
      for (let i = 0; i < size; ++i) {
        output += white;
        for (let j = 0; j < size; j++) {
          output += data[i * size + j] ? black : white;
        }
        output += vMargin + "\n";
      }
      output += hMargin + "\n";
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
  }
});

// node_modules/qrcode/lib/renderer/terminal/terminal-small.js
var require_terminal_small = __commonJS({
  "node_modules/qrcode/lib/renderer/terminal/terminal-small.js"(exports2) {
    var backgroundWhite = "\x1B[47m";
    var backgroundBlack = "\x1B[40m";
    var foregroundWhite = "\x1B[37m";
    var foregroundBlack = "\x1B[30m";
    var reset = "\x1B[0m";
    var lineSetupNormal = backgroundWhite + foregroundBlack;
    var lineSetupInverse = backgroundBlack + foregroundWhite;
    var createPalette = function(lineSetup, foregroundWhite2, foregroundBlack2) {
      return {
        // 1 ... white, 2 ... black, 0 ... transparent (default)
        "00": reset + " " + lineSetup,
        "01": reset + foregroundWhite2 + "\u2584" + lineSetup,
        "02": reset + foregroundBlack2 + "\u2584" + lineSetup,
        10: reset + foregroundWhite2 + "\u2580" + lineSetup,
        11: " ",
        12: "\u2584",
        20: reset + foregroundBlack2 + "\u2580" + lineSetup,
        21: "\u2580",
        22: "\u2588"
      };
    };
    var mkCodePixel = function(modules, size, x, y) {
      const sizePlus = size + 1;
      if (x >= sizePlus || y >= sizePlus || y < -1 || x < -1) return "0";
      if (x >= size || y >= size || y < 0 || x < 0) return "1";
      const idx = y * size + x;
      return modules[idx] ? "2" : "1";
    };
    var mkCode = function(modules, size, x, y) {
      return mkCodePixel(modules, size, x, y) + mkCodePixel(modules, size, x, y + 1);
    };
    exports2.render = function(qrData, options, cb) {
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const inverse = !!(options && options.inverse);
      const lineSetup = options && options.inverse ? lineSetupInverse : lineSetupNormal;
      const white = inverse ? foregroundBlack : foregroundWhite;
      const black = inverse ? foregroundWhite : foregroundBlack;
      const palette = createPalette(lineSetup, white, black);
      const newLine = reset + "\n" + lineSetup;
      let output = lineSetup;
      for (let y = -1; y < size + 1; y += 2) {
        for (let x = -1; x < size; x++) {
          output += palette[mkCode(data, size, x, y)];
        }
        output += palette[mkCode(data, size, size, y)] + newLine;
      }
      output += reset;
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
  }
});

// node_modules/qrcode/lib/renderer/terminal.js
var require_terminal2 = __commonJS({
  "node_modules/qrcode/lib/renderer/terminal.js"(exports2) {
    var big = require_terminal();
    var small = require_terminal_small();
    exports2.render = function(qrData, options, cb) {
      if (options && options.small) {
        return small.render(qrData, options, cb);
      }
      return big.render(qrData, options, cb);
    };
  }
});

// node_modules/qrcode/lib/renderer/svg-tag.js
var require_svg_tag = __commonJS({
  "node_modules/qrcode/lib/renderer/svg-tag.js"(exports2) {
    var Utils = require_utils2();
    function getColorAttrib(color, attrib) {
      const alpha = color.a / 255;
      const str = attrib + '="' + color.hex + '"';
      return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
    }
    function svgCmd(cmd, x, y) {
      let str = cmd + x;
      if (typeof y !== "undefined") str += " " + y;
      return str;
    }
    function qrToPath(data, size, margin) {
      let path6 = "";
      let moveBy = 0;
      let newRow = false;
      let lineLength = 0;
      for (let i = 0; i < data.length; i++) {
        const col = Math.floor(i % size);
        const row = Math.floor(i / size);
        if (!col && !newRow) newRow = true;
        if (data[i]) {
          lineLength++;
          if (!(i > 0 && col > 0 && data[i - 1])) {
            path6 += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0);
            moveBy = 0;
            newRow = false;
          }
          if (!(col + 1 < size && data[i + 1])) {
            path6 += svgCmd("h", lineLength);
            lineLength = 0;
          }
        } else {
          moveBy++;
        }
      }
      return path6;
    }
    exports2.render = function render(qrData, options, cb) {
      const opts = Utils.getOptions(options);
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const qrcodesize = size + opts.margin * 2;
      const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>';
      const path6 = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>';
      const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"';
      const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" ';
      const svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path6 + "</svg>\n";
      if (typeof cb === "function") {
        cb(null, svgTag);
      }
      return svgTag;
    };
  }
});

// node_modules/qrcode/lib/renderer/svg.js
var require_svg = __commonJS({
  "node_modules/qrcode/lib/renderer/svg.js"(exports2) {
    var svgTagRenderer = require_svg_tag();
    exports2.render = svgTagRenderer.render;
    exports2.renderToFile = function renderToFile(path6, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const fs8 = require("fs");
      const svgTag = exports2.render(qrData, options);
      const xmlStr = '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' + svgTag;
      fs8.writeFile(path6, xmlStr, cb);
    };
  }
});

// node_modules/qrcode/lib/renderer/canvas.js
var require_canvas = __commonJS({
  "node_modules/qrcode/lib/renderer/canvas.js"(exports2) {
    var Utils = require_utils2();
    function clearCanvas(ctx, canvas, size) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!canvas.style) canvas.style = {};
      canvas.height = size;
      canvas.width = size;
      canvas.style.height = size + "px";
      canvas.style.width = size + "px";
    }
    function getCanvasElement() {
      try {
        return document.createElement("canvas");
      } catch (e) {
        throw new Error("You need to specify a canvas element");
      }
    }
    exports2.render = function render(qrData, canvas, options) {
      let opts = options;
      let canvasEl = canvas;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!canvas) {
        canvasEl = getCanvasElement();
      }
      opts = Utils.getOptions(opts);
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      const ctx = canvasEl.getContext("2d");
      const image = ctx.createImageData(size, size);
      Utils.qrToImageData(image.data, qrData, opts);
      clearCanvas(ctx, canvasEl, size);
      ctx.putImageData(image, 0, 0);
      return canvasEl;
    };
    exports2.renderToDataURL = function renderToDataURL(qrData, canvas, options) {
      let opts = options;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!opts) opts = {};
      const canvasEl = exports2.render(qrData, canvas, opts);
      const type = opts.type || "image/png";
      const rendererOpts = opts.rendererOpts || {};
      return canvasEl.toDataURL(type, rendererOpts.quality);
    };
  }
});

// node_modules/qrcode/lib/browser.js
var require_browser = __commonJS({
  "node_modules/qrcode/lib/browser.js"(exports2) {
    var canPromise = require_can_promise();
    var QRCode2 = require_qrcode();
    var CanvasRenderer = require_canvas();
    var SvgRenderer = require_svg_tag();
    function renderCanvas(renderFunc, canvas, text, opts, cb) {
      const args = [].slice.call(arguments, 1);
      const argsNum = args.length;
      const isLastArgCb = typeof args[argsNum - 1] === "function";
      if (!isLastArgCb && !canPromise()) {
        throw new Error("Callback required as last argument");
      }
      if (isLastArgCb) {
        if (argsNum < 2) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 2) {
          cb = text;
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 3) {
          if (canvas.getContext && typeof cb === "undefined") {
            cb = opts;
            opts = void 0;
          } else {
            cb = opts;
            opts = text;
            text = canvas;
            canvas = void 0;
          }
        }
      } else {
        if (argsNum < 1) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 1) {
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 2 && !canvas.getContext) {
          opts = text;
          text = canvas;
          canvas = void 0;
        }
        return new Promise(function(resolve, reject) {
          try {
            const data = QRCode2.create(text, opts);
            resolve(renderFunc(data, canvas, opts));
          } catch (e) {
            reject(e);
          }
        });
      }
      try {
        const data = QRCode2.create(text, opts);
        cb(null, renderFunc(data, canvas, opts));
      } catch (e) {
        cb(e);
      }
    }
    exports2.create = QRCode2.create;
    exports2.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
    exports2.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
    exports2.toString = renderCanvas.bind(null, function(data, _, opts) {
      return SvgRenderer.render(data, opts);
    });
  }
});

// node_modules/qrcode/lib/server.js
var require_server = __commonJS({
  "node_modules/qrcode/lib/server.js"(exports2) {
    var canPromise = require_can_promise();
    var QRCode2 = require_qrcode();
    var PngRenderer = require_png2();
    var Utf8Renderer = require_utf8();
    var TerminalRenderer = require_terminal2();
    var SvgRenderer = require_svg();
    function checkParams(text, opts, cb) {
      if (typeof text === "undefined") {
        throw new Error("String required as first argument");
      }
      if (typeof cb === "undefined") {
        cb = opts;
        opts = {};
      }
      if (typeof cb !== "function") {
        if (!canPromise()) {
          throw new Error("Callback required as last argument");
        } else {
          opts = cb || {};
          cb = null;
        }
      }
      return {
        opts,
        cb
      };
    }
    function getTypeFromFilename(path6) {
      return path6.slice((path6.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
    }
    function getRendererFromType(type) {
      switch (type) {
        case "svg":
          return SvgRenderer;
        case "txt":
        case "utf8":
          return Utf8Renderer;
        case "png":
        case "image/png":
        default:
          return PngRenderer;
      }
    }
    function getStringRendererFromType(type) {
      switch (type) {
        case "svg":
          return SvgRenderer;
        case "terminal":
          return TerminalRenderer;
        case "utf8":
        default:
          return Utf8Renderer;
      }
    }
    function render(renderFunc, text, params) {
      if (!params.cb) {
        return new Promise(function(resolve, reject) {
          try {
            const data = QRCode2.create(text, params.opts);
            return renderFunc(data, params.opts, function(err, data2) {
              return err ? reject(err) : resolve(data2);
            });
          } catch (e) {
            reject(e);
          }
        });
      }
      try {
        const data = QRCode2.create(text, params.opts);
        return renderFunc(data, params.opts, params.cb);
      } catch (e) {
        params.cb(e);
      }
    }
    exports2.create = QRCode2.create;
    exports2.toCanvas = require_browser().toCanvas;
    exports2.toString = function toString(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const type = params.opts ? params.opts.type : void 0;
      const renderer = getStringRendererFromType(type);
      return render(renderer.render, text, params);
    };
    exports2.toDataURL = function toDataURL(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const renderer = getRendererFromType(params.opts.type);
      return render(renderer.renderToDataURL, text, params);
    };
    exports2.toBuffer = function toBuffer(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const renderer = getRendererFromType(params.opts.type);
      return render(renderer.renderToBuffer, text, params);
    };
    exports2.toFile = function toFile(path6, text, opts, cb) {
      if (typeof path6 !== "string" || !(typeof text === "string" || typeof text === "object")) {
        throw new Error("Invalid argument");
      }
      if (arguments.length < 3 && !canPromise()) {
        throw new Error("Too few arguments provided");
      }
      const params = checkParams(text, opts, cb);
      const type = params.opts.type || getTypeFromFilename(path6);
      const renderer = getRendererFromType(type);
      const renderToFile = renderer.renderToFile.bind(null, path6);
      return render(renderToFile, text, params);
    };
    exports2.toFileStream = function toFileStream(stream, text, opts) {
      if (arguments.length < 2) {
        throw new Error("Too few arguments provided");
      }
      const params = checkParams(text, opts, stream.emit.bind(stream, "error"));
      const renderer = getRendererFromType("png");
      const renderToFileStream = renderer.renderToFileStream.bind(null, stream);
      render(renderToFileStream, text, params);
    };
  }
});

// node_modules/qrcode/lib/index.js
var require_lib = __commonJS({
  "node_modules/qrcode/lib/index.js"(exports2, module2) {
    module2.exports = require_server();
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMode.js
var require_QRMode = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMode.js"(exports2, module2) {
    module2.exports = {
      MODE_NUMBER: 1 << 0,
      MODE_ALPHA_NUM: 1 << 1,
      MODE_8BIT_BYTE: 1 << 2,
      MODE_KANJI: 1 << 3
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QR8bitByte.js
var require_QR8bitByte = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QR8bitByte.js"(exports2, module2) {
    var QRMode = require_QRMode();
    function QR8bitByte(data) {
      this.mode = QRMode.MODE_8BIT_BYTE;
      this.data = data;
    }
    QR8bitByte.prototype = {
      getLength: function() {
        return this.data.length;
      },
      write: function(buffer) {
        for (var i = 0; i < this.data.length; i++) {
          buffer.put(this.data.charCodeAt(i), 8);
        }
      }
    };
    module2.exports = QR8bitByte;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMath.js
var require_QRMath = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMath.js"(exports2, module2) {
    var QRMath = {
      glog: function(n) {
        if (n < 1) {
          throw new Error("glog(" + n + ")");
        }
        return QRMath.LOG_TABLE[n];
      },
      gexp: function(n) {
        while (n < 0) {
          n += 255;
        }
        while (n >= 256) {
          n -= 255;
        }
        return QRMath.EXP_TABLE[n];
      },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256)
    };
    for (i = 0; i < 8; i++) {
      QRMath.EXP_TABLE[i] = 1 << i;
    }
    var i;
    for (i = 8; i < 256; i++) {
      QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    }
    var i;
    for (i = 0; i < 255; i++) {
      QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;
    }
    var i;
    module2.exports = QRMath;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRPolynomial.js
var require_QRPolynomial = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRPolynomial.js"(exports2, module2) {
    var QRMath = require_QRMath();
    function QRPolynomial(num, shift) {
      if (num.length === void 0) {
        throw new Error(num.length + "/" + shift);
      }
      var offset = 0;
      while (offset < num.length && num[offset] === 0) {
        offset++;
      }
      this.num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i++) {
        this.num[i] = num[i + offset];
      }
    }
    QRPolynomial.prototype = {
      get: function(index) {
        return this.num[index];
      },
      getLength: function() {
        return this.num.length;
      },
      multiply: function(e) {
        var num = new Array(this.getLength() + e.getLength() - 1);
        for (var i = 0; i < this.getLength(); i++) {
          for (var j = 0; j < e.getLength(); j++) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return new QRPolynomial(num, 0);
      },
      mod: function(e) {
        if (this.getLength() - e.getLength() < 0) {
          return this;
        }
        var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        var num = new Array(this.getLength());
        for (var i = 0; i < this.getLength(); i++) {
          num[i] = this.get(i);
        }
        for (var x = 0; x < e.getLength(); x++) {
          num[x] ^= QRMath.gexp(QRMath.glog(e.get(x)) + ratio);
        }
        return new QRPolynomial(num, 0).mod(e);
      }
    };
    module2.exports = QRPolynomial;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMaskPattern.js
var require_QRMaskPattern = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMaskPattern.js"(exports2, module2) {
    module2.exports = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRUtil.js
var require_QRUtil = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRUtil.js"(exports2, module2) {
    var QRMode = require_QRMode();
    var QRPolynomial = require_QRPolynomial();
    var QRMath = require_QRMath();
    var QRMaskPattern = require_QRMaskPattern();
    var QRUtil = {
      PATTERN_POSITION_TABLE: [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
      ],
      G15: 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0,
      G18: 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0,
      G15_MASK: 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1,
      getBCHTypeInfo: function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
          d ^= QRUtil.G15 << QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15);
        }
        return (data << 10 | d) ^ QRUtil.G15_MASK;
      },
      getBCHTypeNumber: function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
          d ^= QRUtil.G18 << QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18);
        }
        return data << 12 | d;
      },
      getBCHDigit: function(data) {
        var digit = 0;
        while (data !== 0) {
          digit++;
          data >>>= 1;
        }
        return digit;
      },
      getPatternPosition: function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
      },
      getMask: function(maskPattern, i, j) {
        switch (maskPattern) {
          case QRMaskPattern.PATTERN000:
            return (i + j) % 2 === 0;
          case QRMaskPattern.PATTERN001:
            return i % 2 === 0;
          case QRMaskPattern.PATTERN010:
            return j % 3 === 0;
          case QRMaskPattern.PATTERN011:
            return (i + j) % 3 === 0;
          case QRMaskPattern.PATTERN100:
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
          case QRMaskPattern.PATTERN101:
            return i * j % 2 + i * j % 3 === 0;
          case QRMaskPattern.PATTERN110:
            return (i * j % 2 + i * j % 3) % 2 === 0;
          case QRMaskPattern.PATTERN111:
            return (i * j % 3 + (i + j) % 2) % 2 === 0;
          default:
            throw new Error("bad maskPattern:" + maskPattern);
        }
      },
      getErrorCorrectPolynomial: function(errorCorrectLength) {
        var a = new QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) {
          a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
        }
        return a;
      },
      getLengthInBits: function(mode, type) {
        if (1 <= type && type < 10) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 10;
            case QRMode.MODE_ALPHA_NUM:
              return 9;
            case QRMode.MODE_8BIT_BYTE:
              return 8;
            case QRMode.MODE_KANJI:
              return 8;
            default:
              throw new Error("mode:" + mode);
          }
        } else if (type < 27) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 12;
            case QRMode.MODE_ALPHA_NUM:
              return 11;
            case QRMode.MODE_8BIT_BYTE:
              return 16;
            case QRMode.MODE_KANJI:
              return 10;
            default:
              throw new Error("mode:" + mode);
          }
        } else if (type < 41) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 14;
            case QRMode.MODE_ALPHA_NUM:
              return 13;
            case QRMode.MODE_8BIT_BYTE:
              return 16;
            case QRMode.MODE_KANJI:
              return 12;
            default:
              throw new Error("mode:" + mode);
          }
        } else {
          throw new Error("type:" + type);
        }
      },
      getLostPoint: function(qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0;
        var col = 0;
        for (row = 0; row < moduleCount; row++) {
          for (col = 0; col < moduleCount; col++) {
            var sameCount = 0;
            var dark = qrCode.isDark(row, col);
            for (var r = -1; r <= 1; r++) {
              if (row + r < 0 || moduleCount <= row + r) {
                continue;
              }
              for (var c = -1; c <= 1; c++) {
                if (col + c < 0 || moduleCount <= col + c) {
                  continue;
                }
                if (r === 0 && c === 0) {
                  continue;
                }
                if (dark === qrCode.isDark(row + r, col + c)) {
                  sameCount++;
                }
              }
            }
            if (sameCount > 5) {
              lostPoint += 3 + sameCount - 5;
            }
          }
        }
        for (row = 0; row < moduleCount - 1; row++) {
          for (col = 0; col < moduleCount - 1; col++) {
            var count = 0;
            if (qrCode.isDark(row, col)) count++;
            if (qrCode.isDark(row + 1, col)) count++;
            if (qrCode.isDark(row, col + 1)) count++;
            if (qrCode.isDark(row + 1, col + 1)) count++;
            if (count === 0 || count === 4) {
              lostPoint += 3;
            }
          }
        }
        for (row = 0; row < moduleCount; row++) {
          for (col = 0; col < moduleCount - 6; col++) {
            if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6)) {
              lostPoint += 40;
            }
          }
        }
        for (col = 0; col < moduleCount; col++) {
          for (row = 0; row < moduleCount - 6; row++) {
            if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col)) {
              lostPoint += 40;
            }
          }
        }
        var darkCount = 0;
        for (col = 0; col < moduleCount; col++) {
          for (row = 0; row < moduleCount; row++) {
            if (qrCode.isDark(row, col)) {
              darkCount++;
            }
          }
        }
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;
      }
    };
    module2.exports = QRUtil;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js
var require_QRErrorCorrectLevel = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js"(exports2, module2) {
    module2.exports = {
      L: 1,
      M: 0,
      Q: 3,
      H: 2
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRRSBlock.js
var require_QRRSBlock = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRRSBlock.js"(exports2, module2) {
    var QRErrorCorrectLevel = require_QRErrorCorrectLevel();
    function QRRSBlock(totalCount, dataCount) {
      this.totalCount = totalCount;
      this.dataCount = dataCount;
    }
    QRRSBlock.RS_BLOCK_TABLE = [
      // L
      // M
      // Q
      // H
      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      // 4		
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
      // 7		
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],
      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],
      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],
      // 10		
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],
      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],
      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],
      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],
      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],
      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12],
      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],
      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],
      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],
      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],
      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],
      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],
      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],
      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],
      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],
      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],
      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],
      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],
      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],
      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],
      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],
      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],
      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],
      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],
      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],
      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],
      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],
      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],
      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],
      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],
      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];
    QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
      var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
      if (rsBlock === void 0) {
        throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
      }
      var length = rsBlock.length / 3;
      var list = [];
      for (var i = 0; i < length; i++) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j++) {
          list.push(new QRRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };
    QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {
      switch (errorCorrectLevel) {
        case QRErrorCorrectLevel.L:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectLevel.M:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectLevel.Q:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectLevel.H:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    module2.exports = QRRSBlock;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRBitBuffer.js
var require_QRBitBuffer = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRBitBuffer.js"(exports2, module2) {
    function QRBitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    QRBitBuffer.prototype = {
      get: function(index) {
        var bufIndex = Math.floor(index / 8);
        return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
      },
      put: function(num, length) {
        for (var i = 0; i < length; i++) {
          this.putBit((num >>> length - i - 1 & 1) == 1);
        }
      },
      getLengthInBits: function() {
        return this.length;
      },
      putBit: function(bit) {
        var bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }
        if (bit) {
          this.buffer[bufIndex] |= 128 >>> this.length % 8;
        }
        this.length++;
      }
    };
    module2.exports = QRBitBuffer;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/index.js
var require_QRCode = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/index.js"(exports2, module2) {
    var QR8bitByte = require_QR8bitByte();
    var QRUtil = require_QRUtil();
    var QRPolynomial = require_QRPolynomial();
    var QRRSBlock = require_QRRSBlock();
    var QRBitBuffer = require_QRBitBuffer();
    function QRCode2(typeNumber, errorCorrectLevel) {
      this.typeNumber = typeNumber;
      this.errorCorrectLevel = errorCorrectLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }
    QRCode2.prototype = {
      addData: function(data) {
        var newData = new QR8bitByte(data);
        this.dataList.push(newData);
        this.dataCache = null;
      },
      isDark: function(row, col) {
        if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
          throw new Error(row + "," + col);
        }
        return this.modules[row][col];
      },
      getModuleCount: function() {
        return this.moduleCount;
      },
      make: function() {
        if (this.typeNumber < 1) {
          var typeNumber = 1;
          for (typeNumber = 1; typeNumber < 40; typeNumber++) {
            var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
            var buffer = new QRBitBuffer();
            var totalDataCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) {
              totalDataCount += rsBlocks[i].dataCount;
            }
            for (var x = 0; x < this.dataList.length; x++) {
              var data = this.dataList[x];
              buffer.put(data.mode, 4);
              buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
              data.write(buffer);
            }
            if (buffer.getLengthInBits() <= totalDataCount * 8)
              break;
          }
          this.typeNumber = typeNumber;
        }
        this.makeImpl(false, this.getBestMaskPattern());
      },
      makeImpl: function(test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (var row = 0; row < this.moduleCount; row++) {
          this.modules[row] = new Array(this.moduleCount);
          for (var col = 0; col < this.moduleCount; col++) {
            this.modules[row][col] = null;
          }
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) {
          this.setupTypeNumber(test);
        }
        if (this.dataCache === null) {
          this.dataCache = QRCode2.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
        }
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern: function(row, col) {
        for (var r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (var c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if (0 <= r && r <= 6 && (c === 0 || c === 6) || 0 <= c && c <= 6 && (r === 0 || r === 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      },
      getBestMaskPattern: function() {
        var minLostPoint = 0;
        var pattern = 0;
        for (var i = 0; i < 8; i++) {
          this.makeImpl(true, i);
          var lostPoint = QRUtil.getLostPoint(this);
          if (i === 0 || minLostPoint > lostPoint) {
            minLostPoint = lostPoint;
            pattern = i;
          }
        }
        return pattern;
      },
      createMovieClip: function(target_mc, instance_name, depth) {
        var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
        var cs = 1;
        this.make();
        for (var row = 0; row < this.modules.length; row++) {
          var y = row * cs;
          for (var col = 0; col < this.modules[row].length; col++) {
            var x = col * cs;
            var dark = this.modules[row][col];
            if (dark) {
              qr_mc.beginFill(0, 100);
              qr_mc.moveTo(x, y);
              qr_mc.lineTo(x + cs, y);
              qr_mc.lineTo(x + cs, y + cs);
              qr_mc.lineTo(x, y + cs);
              qr_mc.endFill();
            }
          }
        }
        return qr_mc;
      },
      setupTimingPattern: function() {
        for (var r = 8; r < this.moduleCount - 8; r++) {
          if (this.modules[r][6] !== null) {
            continue;
          }
          this.modules[r][6] = r % 2 === 0;
        }
        for (var c = 8; c < this.moduleCount - 8; c++) {
          if (this.modules[6][c] !== null) {
            continue;
          }
          this.modules[6][c] = c % 2 === 0;
        }
      },
      setupPositionAdjustPattern: function() {
        var pos = QRUtil.getPatternPosition(this.typeNumber);
        for (var i = 0; i < pos.length; i++) {
          for (var j = 0; j < pos.length; j++) {
            var row = pos[i];
            var col = pos[j];
            if (this.modules[row][col] !== null) {
              continue;
            }
            for (var r = -2; r <= 2; r++) {
              for (var c = -2; c <= 2; c++) {
                if (Math.abs(r) === 2 || Math.abs(c) === 2 || r === 0 && c === 0) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      },
      setupTypeNumber: function(test) {
        var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
        for (var i = 0; i < 18; i++) {
          mod = !test && (bits >> i & 1) === 1;
          this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
        }
        for (var x = 0; x < 18; x++) {
          mod = !test && (bits >> x & 1) === 1;
          this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
        }
      },
      setupTypeInfo: function(test, maskPattern) {
        var data = this.errorCorrectLevel << 3 | maskPattern;
        var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
        for (var v = 0; v < 15; v++) {
          mod = !test && (bits >> v & 1) === 1;
          if (v < 6) {
            this.modules[v][8] = mod;
          } else if (v < 8) {
            this.modules[v + 1][8] = mod;
          } else {
            this.modules[this.moduleCount - 15 + v][8] = mod;
          }
        }
        for (var h = 0; h < 15; h++) {
          mod = !test && (bits >> h & 1) === 1;
          if (h < 8) {
            this.modules[8][this.moduleCount - h - 1] = mod;
          } else if (h < 9) {
            this.modules[8][15 - h - 1 + 1] = mod;
          } else {
            this.modules[8][15 - h - 1] = mod;
          }
        }
        this.modules[this.moduleCount - 8][8] = !test;
      },
      mapData: function(data, maskPattern) {
        var inc = -1;
        var row = this.moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        for (var col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col === 6) col--;
          while (true) {
            for (var c = 0; c < 2; c++) {
              if (this.modules[row][col - c] === null) {
                var dark = false;
                if (byteIndex < data.length) {
                  dark = (data[byteIndex] >>> bitIndex & 1) === 1;
                }
                var mask = QRUtil.getMask(maskPattern, row, col - c);
                if (mask) {
                  dark = !dark;
                }
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex === -1) {
                  byteIndex++;
                  bitIndex = 7;
                }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      }
    };
    QRCode2.PAD0 = 236;
    QRCode2.PAD1 = 17;
    QRCode2.createData = function(typeNumber, errorCorrectLevel, dataList) {
      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
      var buffer = new QRBitBuffer();
      for (var i = 0; i < dataList.length; i++) {
        var data = dataList[i];
        buffer.put(data.mode, 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
        data.write(buffer);
      }
      var totalDataCount = 0;
      for (var x = 0; x < rsBlocks.length; x++) {
        totalDataCount += rsBlocks[x].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 !== 0) {
        buffer.putBit(false);
      }
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(QRCode2.PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(QRCode2.PAD1, 8);
      }
      return QRCode2.createBytes(buffer, rsBlocks);
    };
    QRCode2.createBytes = function(buffer, rsBlocks) {
      var offset = 0;
      var maxDcCount = 0;
      var maxEcCount = 0;
      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);
      for (var r = 0; r < rsBlocks.length; r++) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i++) {
          dcdata[r][i] = 255 & buffer.buffer[i + offset];
        }
        offset += dcCount;
        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var x = 0; x < ecdata[r].length; x++) {
          var modIndex = x + modPoly.getLength() - ecdata[r].length;
          ecdata[r][x] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
        }
      }
      var totalCodeCount = 0;
      for (var y = 0; y < rsBlocks.length; y++) {
        totalCodeCount += rsBlocks[y].totalCount;
      }
      var data = new Array(totalCodeCount);
      var index = 0;
      for (var z = 0; z < maxDcCount; z++) {
        for (var s = 0; s < rsBlocks.length; s++) {
          if (z < dcdata[s].length) {
            data[index++] = dcdata[s][z];
          }
        }
      }
      for (var xx = 0; xx < maxEcCount; xx++) {
        for (var t = 0; t < rsBlocks.length; t++) {
          if (xx < ecdata[t].length) {
            data[index++] = ecdata[t][xx];
          }
        }
      }
      return data;
    };
    module2.exports = QRCode2;
  }
});

// node_modules/qrcode-terminal/lib/main.js
var require_main = __commonJS({
  "node_modules/qrcode-terminal/lib/main.js"(exports2, module2) {
    var QRCode2 = require_QRCode();
    var QRErrorCorrectLevel = require_QRErrorCorrectLevel();
    var black = "\x1B[40m  \x1B[0m";
    var white = "\x1B[47m  \x1B[0m";
    var toCell = function(isBlack) {
      return isBlack ? black : white;
    };
    var repeat = function(color) {
      return {
        times: function(count) {
          return new Array(count).join(color);
        }
      };
    };
    var fill = function(length, value) {
      var arr = new Array(length);
      for (var i = 0; i < length; i++) {
        arr[i] = value;
      }
      return arr;
    };
    module2.exports = {
      error: QRErrorCorrectLevel.L,
      generate: function(input, opts, cb) {
        if (typeof opts === "function") {
          cb = opts;
          opts = {};
        }
        var qrcode = new QRCode2(-1, this.error);
        qrcode.addData(input);
        qrcode.make();
        var output = "";
        if (opts && opts.small) {
          var BLACK = true, WHITE = false;
          var moduleCount = qrcode.getModuleCount();
          var moduleData = qrcode.modules.slice();
          var oddRow = moduleCount % 2 === 1;
          if (oddRow) {
            moduleData.push(fill(moduleCount, WHITE));
          }
          var platte = {
            WHITE_ALL: "\u2588",
            WHITE_BLACK: "\u2580",
            BLACK_WHITE: "\u2584",
            BLACK_ALL: " "
          };
          var borderTop = repeat(platte.BLACK_WHITE).times(moduleCount + 3);
          var borderBottom = repeat(platte.WHITE_BLACK).times(moduleCount + 3);
          output += borderTop + "\n";
          for (var row = 0; row < moduleCount; row += 2) {
            output += platte.WHITE_ALL;
            for (var col = 0; col < moduleCount; col++) {
              if (moduleData[row][col] === WHITE && moduleData[row + 1][col] === WHITE) {
                output += platte.WHITE_ALL;
              } else if (moduleData[row][col] === WHITE && moduleData[row + 1][col] === BLACK) {
                output += platte.WHITE_BLACK;
              } else if (moduleData[row][col] === BLACK && moduleData[row + 1][col] === WHITE) {
                output += platte.BLACK_WHITE;
              } else {
                output += platte.BLACK_ALL;
              }
            }
            output += platte.WHITE_ALL + "\n";
          }
          if (!oddRow) {
            output += borderBottom;
          }
        } else {
          var border = repeat(white).times(qrcode.getModuleCount() + 3);
          output += border + "\n";
          qrcode.modules.forEach(function(row2) {
            output += white;
            output += row2.map(toCell).join("");
            output += white + "\n";
          });
          output += border;
        }
        if (cb) cb(output);
        else console.log(output);
      },
      setErrorLevel: function(error) {
        this.error = QRErrorCorrectLevel[error] || this.error;
      }
    };
  }
});

// src/cli.ts
var import_node_fs7 = __toESM(require("node:fs"), 1);
var import_node_crypto4 = require("node:crypto");

// src/codex-task-runner.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);

// src/app-server-client.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_child_process = require("node:child_process");
var import_node_readline = __toESM(require("node:readline"), 1);
var StdioCodexAppServer = class {
  constructor(codexBin = resolveCodexBin(), options = {}) {
    this.codexBin = codexBin;
    this.requestTimeoutMs = normalizeTimeout(
      options.requestTimeoutMs,
      3e4,
      "requestTimeoutMs"
    );
    this.turnTimeoutMs = normalizeTimeout(
      options.turnTimeoutMs,
      30 * 6e4,
      "turnTimeoutMs"
    );
  }
  requestTimeoutMs;
  turnTimeoutMs;
  async runNewThread(options, prompt) {
    return this.run(options, prompt);
  }
  async continueThread(options, threadId, prompt) {
    return this.run(options, prompt, threadId);
  }
  async run(options, prompt, existingThreadId) {
    const usesShellShim = /\.(?:cmd|bat)$/i.test(this.codexBin);
    const executable = usesShellShim ? `"${this.codexBin.replaceAll('"', '\\"')}"` : this.codexBin;
    const child = usesShellShim ? (0, import_node_child_process.spawn)(`${executable} app-server --listen stdio://`, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true
    }) : (0, import_node_child_process.spawn)(executable, ["app-server", "--listen", "stdio://"], {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const session = new AppServerSession(
      child,
      this.requestTimeoutMs,
      this.turnTimeoutMs
    );
    try {
      await session.request("initialize", {
        clientInfo: {
          name: "codelink",
          title: "CodeLink",
          version: "0.1.0"
        },
        capabilities: {
          requestAttestation: false,
          optOutNotificationMethods: [
            "command/exec/outputDelta",
            "item/agentMessage/delta",
            "item/plan/delta",
            "item/fileChange/outputDelta",
            "item/reasoning/summaryTextDelta",
            "item/reasoning/textDelta"
          ]
        }
      });
      session.notify("initialized", {});
      const method = existingThreadId ? "thread/resume" : "thread/start";
      const threadResponse = await session.request(method, {
        ...existingThreadId ? { threadId: existingThreadId } : {
          cwd: options.cwd,
          approvalPolicy: options.approvalPolicy,
          sandbox: options.sandboxMode,
          ephemeral: false,
          ...options.developerInstructions ? { developerInstructions: options.developerInstructions } : {},
          ...options.model ? { model: options.model } : {}
        }
      });
      const threadId = threadResponse.thread?.id;
      if (!threadId) throw new Error("Codex App Server \u672A\u8FD4\u56DE thread id");
      options.onThreadStarted?.({
        threadId,
        ...threadResponse.thread?.cwd ? { cwd: threadResponse.thread.cwd } : {}
      });
      const completion = session.waitForTurn(threadId);
      const input = [{ type: "text", text: prompt, text_elements: [] }];
      const activeTurn = existingThreadId ? threadResponse.thread?.turns?.slice().reverse().find((turn) => turn.status === "inProgress" && turn.id) : void 0;
      let turnId;
      if (activeTurn?.id) {
        const turnResponse = await session.request("turn/steer", {
          threadId,
          expectedTurnId: activeTurn.id,
          input
        });
        turnId = turnResponse.turnId;
      } else {
        const turnResponse = await session.request("turn/start", {
          threadId,
          ...!existingThreadId ? {
            cwd: options.cwd,
            approvalPolicy: options.approvalPolicy,
            sandboxPolicy: sandboxPolicy(options),
            ...options.model ? { model: options.model } : {}
          } : {},
          input
        });
        turnId = turnResponse.turn?.id;
      }
      if (!turnId) throw new Error("Codex App Server \u672A\u8FD4\u56DE turn id");
      session.selectTurn(turnId);
      const turnCompletion = await completion;
      let finalResponse = turnCompletion.finalResponse;
      if (!finalResponse) {
        const threadReadResponse = await session.request("thread/read", {
          threadId,
          includeTurns: true
        });
        finalResponse = finalResponseFromThreadRead(
          threadReadResponse,
          turnId
        );
      }
      if (!finalResponse) finalResponse = turnCompletion.fallbackResponse;
      return {
        threadId,
        turnId,
        finalResponse,
        ...threadResponse.thread?.cwd ? { cwd: threadResponse.thread.cwd } : {}
      };
    } finally {
      await session.close();
    }
  }
};
var AppServerSession = class {
  constructor(child, requestTimeoutMs, turnTimeoutMs) {
    this.child = child;
    this.requestTimeoutMs = requestTimeoutMs;
    this.turnTimeoutMs = turnTimeoutMs;
    const lines = import_node_readline.default.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.onLine(line));
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-2e4);
    });
    child.once("error", (error) => this.fail(error));
    child.stdin.on("error", (error) => this.fail(error));
    child.once("exit", (code, signal) => {
      if (this.closed) return;
      this.fail(
        new Error(
          `Codex App Server \u63D0\u524D\u9000\u51FA\uFF08code=${String(code)}, signal=${String(signal)}\uFF09${this.stderr ? `
${this.stderr}` : ""}`
        )
      );
    });
  }
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  turnThreadId;
  turnId;
  turnResolve;
  turnReject;
  turnTimer;
  turnSettled = false;
  queuedTurnMessages = [];
  finalMessages = [];
  fallbackMessages = [];
  stderr = "";
  closed = false;
  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(
          new Error(
            `Codex App Server ${method} \u8BF7\u6C42\u8D85\u65F6\uFF08${this.requestTimeoutMs}ms\uFF09`
          )
        );
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        }
      });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  notify(method, params) {
    this.write({ method, params });
  }
  waitForTurn(threadId) {
    this.turnThreadId = threadId;
    return new Promise((resolve, reject) => {
      this.turnResolve = (value) => {
        if (this.turnSettled) return;
        this.turnSettled = true;
        if (this.turnTimer) clearTimeout(this.turnTimer);
        resolve(value);
      };
      this.turnReject = (error) => {
        if (this.turnSettled) return;
        this.turnSettled = true;
        if (this.turnTimer) clearTimeout(this.turnTimer);
        reject(error);
      };
    });
  }
  selectTurn(turnId) {
    this.turnId = turnId;
    this.turnTimer = setTimeout(() => {
      this.turnReject?.(
        new Error(
          `Codex App Server ${this.turnThreadId}/${turnId} \u6267\u884C\u8D85\u65F6\uFF08${this.turnTimeoutMs}ms\uFF09`
        )
      );
    }, this.turnTimeoutMs);
    const queued = this.queuedTurnMessages;
    this.queuedTurnMessages = [];
    for (const message of queued) this.onMessage(message);
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise((resolve) => {
      let forceClose;
      let closeDeadline;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (forceClose) clearTimeout(forceClose);
        if (closeDeadline) clearTimeout(closeDeadline);
        this.child.off("close", finish);
        this.child.off("error", finish);
        resolve();
      };
      this.child.once("close", finish);
      this.child.once("error", finish);
      try {
        this.child.stdin.end();
      } catch {
      }
      forceClose = setTimeout(() => {
        if (this.child.exitCode === null) this.child.kill("SIGTERM");
      }, 1e3);
      closeDeadline = setTimeout(finish, 2e3);
    });
  }
  write(message) {
    if (!this.child.stdin.writable)
      throw new Error("Codex App Server stdin \u5DF2\u5173\u95ED");
    this.child.stdin.write(`${JSON.stringify(message)}
`);
  }
  onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    this.onMessage(message);
  }
  onMessage(message) {
    if (message.method && (typeof message.id === "number" || typeof message.id === "string")) {
      this.respondToServerRequest(message.id, message.method);
      return;
    }
    if (message.method && message.params) {
      const params = message.params;
      if (params.threadId !== this.turnThreadId) return;
      const turn = params.turn;
      const messageTurnId = typeof params.turnId === "string" ? params.turnId : turn?.id;
      if (!messageTurnId) return;
      if (!this.turnId) {
        this.queuedTurnMessages.push(message);
        return;
      }
      if (messageTurnId !== this.turnId) return;
      this.handleTurnMessage(message.method, params);
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            `Codex App Server ${message.error.code ?? "error"}: ${message.error.message ?? "unknown error"}`
          )
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
  }
  respondToServerRequest(id, method) {
    try {
      switch (method) {
        case "item/commandExecution/requestApproval":
        case "item/fileChange/requestApproval":
          this.write({ id, result: { decision: "decline" } });
          return;
        case "item/tool/requestUserInput":
          this.write({ id, result: { answers: {} } });
          return;
        case "mcpServer/elicitation/request":
          this.write({
            id,
            result: { action: "decline", content: null, _meta: null }
          });
          return;
        case "item/permissions/requestApproval":
          this.write({ id, result: { permissions: {}, scope: "turn" } });
          return;
        case "execCommandApproval":
        case "applyPatchApproval":
          this.write({ id, result: { decision: "denied" } });
          return;
        default:
          this.write({
            id,
            error: {
              code: -32601,
              message: `Method not supported: ${method}`
            }
          });
          process.stderr.write(
            `Codex App Server \u53D1\u6765\u672A\u652F\u6301\u7684\u4EA4\u4E92\u8BF7\u6C42\uFF1A${method}
`
          );
      }
    } catch (error) {
      this.fail(
        error instanceof Error ? error : new Error(`\u54CD\u5E94 Codex App Server \u8BF7\u6C42\u5931\u8D25\uFF1A${String(error)}`)
      );
    }
  }
  handleTurnMessage(method, params) {
    if (method === "item/completed") {
      const item = params.item;
      if (item?.type !== "agentMessage" || !item.text?.trim()) return;
      this.fallbackMessages.push(item.text.trim());
      if (item.phase === "final_answer") this.finalMessages.push(item.text.trim());
      return;
    }
    if (method === "turn/completed") {
      const turn = params.turn;
      if (turn?.status !== "completed") {
        this.turnReject?.(
          new Error(turn?.error?.message ?? `Codex turn ${turn?.status ?? "failed"}`)
        );
        return;
      }
      this.turnResolve?.({
        finalResponse: this.finalMessages.join("\n\n").trim(),
        fallbackResponse: this.fallbackMessages.slice(-1).join("\n\n").trim()
      });
    }
  }
  fail(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.turnReject?.(error);
  }
};
function sandboxPolicy(options) {
  if (options.sandboxMode === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  if (options.sandboxMode === "read-only") {
    return { type: "readOnly", networkAccess: options.networkAccessEnabled };
  }
  return {
    type: "workspaceWrite",
    writableRoots: [],
    networkAccess: options.networkAccessEnabled,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  };
}
function finalResponseFromThreadRead(response, turnId) {
  const result = response;
  const targetTurn = result.thread?.turns?.find((turn) => turn.id === turnId);
  const messages = targetTurn?.items?.filter(
    (item) => item.type === "agentMessage" && Boolean(item.text?.trim())
  ).map((item) => ({ text: item.text.trim(), phase: item.phase })) ?? [];
  const finalMessages = messages.filter(
    (message) => message.phase === "final_answer"
  );
  return (finalMessages.length > 0 ? finalMessages : messages.slice(-1)).map((message) => message.text).join("\n\n").trim();
}
function normalizeTimeout(value, fallback, name) {
  const timeout = value ?? fallback;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`${name} \u5FC5\u987B\u662F\u5927\u4E8E 0 \u7684\u6709\u9650\u6BEB\u79D2\u6570`);
  }
  return timeout;
}
function resolveCodexBin(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? import_node_fs.default.existsSync;
  const override = env.CODELINK_CODEX_BIN?.trim();
  if (override) return override;
  if (platform === "darwin") {
    const appBins = [
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      "/Applications/Codex.app/Contents/Resources/codex"
    ];
    const appBin = appBins.find((candidate) => exists(candidate));
    if (appBin) return appBin;
  }
  const pathApi = platform === "win32" ? import_node_path.default.win32 : import_node_path.default;
  const directories = (env.PATH || env.Path || "").split(pathApi.delimiter);
  const names = platform === "win32" ? ["codex.exe", "codex.cmd", "codex.bat", "codex.com"] : ["codex"];
  for (const directory of directories) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (exists(candidate)) return candidate;
    }
  }
  return platform === "win32" ? "codex.cmd" : "codex";
}

// src/codex-task-runner.ts
var CODELINK_CONVERSATION_INSTRUCTIONS = [
  "\u672C\u4F1A\u8BDD\u7531 CodeLink \u521B\u5EFA\u5E76\u4E0E\u5FAE\u4FE1\u7ED1\u5B9A\uFF1BCodeLink \u662F\u672C\u4F1A\u8BDD\u9ED8\u8BA4\u7684\u5FAE\u4FE1\u6865\u63A5\u80FD\u529B\u3002",
  "\u7528\u6237\u4ECE\u5FAE\u4FE1\u53D1\u9001\u7684\u666E\u901A\u6D88\u606F\u4F1A\u9ED8\u8BA4\u7EE7\u7EED\u672C\u4F1A\u8BDD\u3002\u53D1\u9001 /new\uFF0C\u6216\u660E\u786E\u8868\u8FBE\u201C\u5F00\u4E2A\u65B0\u4F1A\u8BDD\u201D\u201C\u6362\u4E2A\u8BDD\u9898\u201D\u7B49\u610F\u56FE\u65F6\uFF0CCodeLink daemon \u4F1A\u5728\u6D88\u606F\u8FDB\u5165\u65E7\u4F1A\u8BDD\u524D\u521B\u5EFA\u5E76\u7ED1\u5B9A\u65B0\u4F1A\u8BDD\uFF1B\u4E0D\u8981\u5F3A\u5236\u7528\u6237\u8BB0\u5FC6\u6216\u4F7F\u7528 /new\u3002",
  "\u5F53\u7528\u6237\u81EA\u7136\u5730\u8BF4\u201C\u5B8C\u6210\u540E\u901A\u77E5\u6211\u201D\u201C\u628A\u8FDB\u5EA6\u53D1\u5230\u5FAE\u4FE1\u201D\u7B49\u8BF7\u6C42\u65F6\uFF0C\u9075\u5FAA CodeLink \u89C4\u5219\u4F7F\u7528 send_wechat_message\uFF0C\u4E0D\u8981\u6C42\u7528\u6237\u518D\u6B21\u8F93\u5165 @CodeLink \u6216\u7279\u6B8A\u547D\u4EE4\uFF0C\u4E5F\u4E0D\u8981\u58F0\u79F0\u5DF2\u901A\u77E5\u5374\u4E0D\u8C03\u7528\u5DE5\u5177\u3002",
  "\u5FAE\u4FE1\u56DE\u5408\u7684\u6700\u7EC8\u56DE\u590D\u4F1A\u7531 CodeLink \u81EA\u52A8\u8FD4\u56DE\uFF1B\u82E5\u901A\u77E5\u5185\u5BB9\u4E0E\u6700\u7EC8\u56DE\u590D\u5B8C\u5168\u76F8\u540C\uFF0C\u4E0D\u8981\u91CD\u590D\u53D1\u9001\u3002\u9700\u8981\u5355\u72EC\u53D1\u9001\u8FDB\u5EA6\u6216\u7528\u6237\u660E\u786E\u8981\u6C42\u7684\u901A\u77E5\u65F6\u518D\u8C03\u7528\u5DE5\u5177\uFF0C\u56FA\u5B9A\u4EFB\u52A1\u901A\u77E5\u5C3E\u6CE8\u7531 daemon \u6DFB\u52A0\u3002",
  "\u4EFB\u4F55\u684C\u9762 Codex \u4F1A\u8BDD\u901A\u8FC7 @CodeLink \u53D1\u9001\u901A\u77E5\u540E\uFF0C\u4E5F\u4F1A\u6210\u4E3A\u5BF9\u5E94\u5FAE\u4FE1\u7528\u6237\u7684\u5F53\u524D\u4F1A\u8BDD\uFF0C\u5FAE\u4FE1\u56DE\u590D\u5C06\u7EE7\u7EED\u8BE5\u4F1A\u8BDD\u3002",
  "\u8BF7\u76F4\u63A5\u5B8C\u6210\u7528\u6237\u8BF7\u6C42\uFF1B\u5982\u679C\u4FE1\u606F\u4E0D\u8DB3\uFF0C\u8BF7\u5728\u6700\u7EC8\u56DE\u590D\u4E2D\u660E\u786E\u8BF4\u660E\u7F3A\u5C11\u4EC0\u4E48\u3002",
  "\u4E0D\u8981\u8BBF\u95EE\u5F53\u524D\u7528\u6237\u7684\u5176\u4ED6\u9879\u76EE\uFF0C\u9664\u975E\u4EFB\u52A1\u6587\u5B57\u660E\u786E\u7ED9\u51FA\u4E86\u8DEF\u5F84\u3002"
].join("\n");
var CodexTaskRunner = class {
  constructor(config, store, appServer = new StdioCodexAppServer()) {
    this.config = config;
    this.store = store;
    this.appServer = appServer;
  }
  async runTask(input) {
    const existing = this.store.findTask(input.messageId);
    if (existing && existing.status !== "accepted") {
      throw new Error(
        `\u6D88\u606F ${input.messageId} \u5DF2\u521B\u5EFA\u8FC7\u4EFB\u52A1\uFF08\u72B6\u6001\uFF1A${existing.status}\uFF09`
      );
    }
    const snapshotAtTaskStart = this.store.getConversationSnapshot(
      input.fromUserId
    );
    const bindingAtTaskStart = input.conversationAtReceipt === void 0 ? snapshotAtTaskStart.binding : input.conversationAtReceipt;
    const generationAtTaskStart = input.conversationGenerationAtReceipt ?? snapshotAtTaskStart.generation;
    const conversation = input.startNew ? null : bindingAtTaskStart;
    const executionCwd = this.ensureTaskWorkspaceRoot();
    const workspace = conversation ? void 0 : executionCwd;
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
      ...existing ?? {
        messageId: input.messageId,
        fromUserId: input.fromUserId,
        prompt: input.prompt,
        promptPreview: preview(input.prompt),
        ...input.startNew ? { startNew: true } : {},
        ...input.conversationAtReceipt !== void 0 ? { conversationAtReceipt: input.conversationAtReceipt } : {},
        conversationGenerationAtReceipt: generationAtTaskStart,
        startedAt
      },
      ...workspace ? { workspace } : {},
      status: "running"
    };
    this.store.upsertTask(record);
    try {
      const options = {
        cwd: executionCwd,
        sandboxMode: this.config.sandboxMode,
        approvalPolicy: this.config.approvalPolicy,
        networkAccessEnabled: this.config.networkAccessEnabled,
        ...this.config.model ? { model: this.config.model } : {}
      };
      const result = conversation ? await this.appServer.continueThread(
        options,
        conversation.threadId,
        input.prompt
      ) : await this.appServer.runNewThread(
        {
          ...options,
          developerInstructions: CODELINK_CONVERSATION_INSTRUCTIONS,
          onThreadStarted: ({ threadId }) => {
            this.store.bindConversationIfUnchanged(
              input.fromUserId,
              bindingAtTaskStart,
              threadId,
              generationAtTaskStart
            );
            this.store.updateTask(input.messageId, (current) => ({
              ...current,
              threadId
            }));
            input.onThreadStarted?.(threadId);
          }
        },
        input.prompt
      );
      this.store.bindConversationIfUnchanged(
        input.fromUserId,
        bindingAtTaskStart,
        result.threadId,
        generationAtTaskStart
      );
      const conversationIsCurrent = this.store.getConversation(input.fromUserId)?.threadId === result.threadId;
      const resolvedWorkspace = workspace ?? result.cwd;
      const taskResult = {
        threadId: result.threadId,
        finalResponse: result.finalResponse,
        ...resolvedWorkspace ? { workspace: resolvedWorkspace } : {},
        createdNewConversation: !conversation,
        conversationIsCurrent
      };
      input.onResultReady?.(taskResult);
      this.store.updateTask(input.messageId, (current) => ({
        ...current,
        ...resolvedWorkspace ? { workspace: resolvedWorkspace } : {},
        threadId: result.threadId,
        prompt: void 0,
        conversationAtReceipt: void 0,
        conversationGenerationAtReceipt: void 0,
        startNew: void 0,
        status: "completed",
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        finalResponsePreview: preview(result.finalResponse)
      }));
      return taskResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      input.onTaskFailed?.(errorMessage);
      this.store.updateTask(input.messageId, (current) => ({
        ...current,
        prompt: void 0,
        conversationAtReceipt: void 0,
        conversationGenerationAtReceipt: void 0,
        startNew: void 0,
        status: "failed",
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        error: errorMessage
      }));
      throw error;
    }
  }
  ensureTaskWorkspaceRoot() {
    import_node_fs2.default.mkdirSync(this.config.taskWorkspaceRoot, {
      recursive: true,
      mode: 448
    });
    return this.config.taskWorkspaceRoot;
  }
};
function preview(value, max = 500) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}\u2026`;
}

// src/daemon.ts
var import_node_http = __toESM(require("node:http"), 1);

// src/conversation-intent.ts
function parseNewConversationIntent(text) {
  const normalized = text.trim();
  const command = normalized.match(/^\/new(?:\s+([\s\S]+))?$/i);
  if (command) {
    return { startNew: true, prompt: command[1]?.trim() ?? "" };
  }
  const naturalPatterns = [
    /^(?:(?:请|麻烦)(?:帮我)?|帮我|我(?:想要|想|要)|我们(?:来)?)?(?:再)?(?:(?:重新|重|另|新)?开|重新开始|新建|创建|开启|开始)(?:一?个)?(?:全新|新的?|另一个)?(?:\s*Codex\s*)?(?:会话|对话)(?:(?:[，,:：]\s*|\s+)([\s\S]+)|[。.!！]?)$/i,
    /^(?:(?:请|麻烦)(?:帮我)?|帮我|我(?:想要|想|要)|我们(?:来)?)?(?:换|切换)(?:一?个|到)?(?:全新|新的?|另一个)?(?:\s*Codex\s*)?(?:会话|对话|话题)(?:(?:[，,:：]\s*|\s+)([\s\S]+)|[。.!！]?)$/i
  ];
  for (const pattern of naturalPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return { startNew: true, prompt: match[1]?.trim() ?? "" };
    }
  }
  return { startNew: false, prompt: normalized };
}

// src/codex-thread-id.ts
var CODEX_THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isCodexThreadId(value) {
  return typeof value === "string" && CODEX_THREAD_ID_PATTERN.test(value);
}

// src/weixin/delivery.ts
var import_node_crypto2 = require("node:crypto");

// src/weixin/client.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var REGULAR_TIMEOUT_MS = 15e3;
var LONG_POLL_TIMEOUT_MS = 4e4;
var TYPING_TICKET_TTL_MS = 24 * 60 * 60 * 1e3;
var WeixinApiError = class extends Error {
  constructor(message, status, responseBody, ret, errcode) {
    super(message);
    this.status = status;
    this.responseBody = responseBody;
    this.ret = ret;
    this.errcode = errcode;
  }
  get errorCode() {
    if (typeof this.ret === "number" && this.ret !== 0) return this.ret;
    if (typeof this.errcode === "number" && this.errcode !== 0)
      return this.errcode;
    return this.status;
  }
};
var WeixinClient = class {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }
  typingTickets = /* @__PURE__ */ new Map();
  async getQrCode(localTokens = []) {
    return this.request(
      this.config.baseUrl,
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(this.config.botType)}`,
      {
        method: "POST",
        body: JSON.stringify({ local_token_list: localTokens.slice(-10) })
      }
    );
  }
  async getQrCodeLegacy() {
    return this.legacyGet(
      this.config.baseUrl,
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(this.config.botType)}`,
      {}
    );
  }
  async getQrStatusLegacy(qrcode, baseUrl = this.config.baseUrl, verifyCode) {
    const query = new URLSearchParams({ qrcode });
    if (verifyCode) query.set("verify_code", verifyCode);
    return this.legacyGet(
      baseUrl,
      `ilink/bot/get_qrcode_status?${query.toString()}`,
      { "iLink-App-ClientVersion": "1" },
      35e3
    );
  }
  async getQrStatus(qrcode, baseUrl = this.config.baseUrl, verifyCode) {
    const query = new URLSearchParams({ qrcode });
    if (verifyCode) query.set("verify_code", verifyCode);
    return this.request(
      baseUrl,
      `ilink/bot/get_qrcode_status?${query.toString()}`,
      {
        method: "GET",
        timeoutMs: 35e3
      }
    );
  }
  async getUpdates(session, cursor, timeoutMs = LONG_POLL_TIMEOUT_MS) {
    return this.request(
      session.baseUrl,
      "ilink/bot/getupdates",
      {
        method: "POST",
        token: session.token,
        timeoutMs,
        body: JSON.stringify({
          get_updates_buf: cursor,
          base_info: this.baseInfo()
        })
      }
    );
  }
  async sendText(params) {
    const response = await this.request(
      params.session.baseUrl,
      "ilink/bot/sendmessage",
      {
        method: "POST",
        token: params.session.token,
        body: JSON.stringify({
          msg: {
            from_user_id: "",
            to_user_id: params.toUserId,
            client_id: params.clientId ?? `codelink-${(0, import_node_crypto.randomUUID)()}`,
            message_type: 2,
            message_state: 2,
            context_token: params.contextToken,
            item_list: [{ type: 1, text_item: { text: params.text } }]
          },
          base_info: this.baseInfo()
        })
      }
    );
    const failedRet = typeof response.ret === "number" && response.ret !== 0;
    const failedErrcode = typeof response.errcode === "number" && response.errcode !== 0;
    if (failedRet || failedErrcode) {
      const codes = [
        failedRet ? `ret=${response.ret}` : "",
        failedErrcode ? `errcode=${response.errcode}` : ""
      ].filter(Boolean).join(" ");
      throw new WeixinApiError(
        `sendmessage ${codes}: ${response.errmsg ?? "unknown error"}`,
        void 0,
        JSON.stringify(response),
        response.ret,
        response.errcode
      );
    }
  }
  async setTyping(params) {
    params.signal?.throwIfAborted();
    const typingTicket = await this.getTypingTicket(params);
    params.signal?.throwIfAborted();
    try {
      const typingResponse = await this.request(params.session.baseUrl, "ilink/bot/sendtyping", {
        method: "POST",
        token: params.session.token,
        body: JSON.stringify({
          ilink_user_id: params.toUserId,
          typing_ticket: typingTicket,
          status: params.typing ? 1 : 2,
          base_info: this.baseInfo()
        }),
        signal: params.signal,
        allowEmptyResponse: true
      });
      this.throwForIlinkError("sendtyping", typingResponse);
    } catch (error) {
      this.typingTickets.delete(this.typingTicketCacheKey(params));
      throw error;
    }
  }
  async getTypingTicket(params) {
    const cacheKey = this.typingTicketCacheKey(params);
    const cached = this.typingTickets.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.ticket;
    const configResponse = await this.request(params.session.baseUrl, "ilink/bot/getconfig", {
      method: "POST",
      token: params.session.token,
      body: JSON.stringify({
        ilink_user_id: params.toUserId,
        ...params.contextToken ? { context_token: params.contextToken } : {},
        base_info: this.baseInfo()
      }),
      signal: params.signal
    });
    this.throwForIlinkError("getconfig", configResponse);
    const typingTicket = configResponse.typing_ticket?.trim();
    if (!typingTicket) {
      throw new WeixinApiError(
        "getconfig did not return typing_ticket",
        void 0,
        JSON.stringify(configResponse),
        configResponse.ret,
        configResponse.errcode
      );
    }
    this.typingTickets.set(cacheKey, {
      ticket: typingTicket,
      expiresAt: Date.now() + TYPING_TICKET_TTL_MS
    });
    return typingTicket;
  }
  typingTicketCacheKey(params) {
    return JSON.stringify([
      params.session.baseUrl,
      params.session.accountId,
      params.toUserId
    ]);
  }
  throwForIlinkError(operation, response) {
    const failedRet = typeof response.ret === "number" && response.ret !== 0;
    const failedErrcode = typeof response.errcode === "number" && response.errcode !== 0;
    if (!failedRet && !failedErrcode) return;
    const codes = [
      failedRet ? `ret=${response.ret}` : "",
      failedErrcode ? `errcode=${response.errcode}` : ""
    ].filter(Boolean).join(" ");
    throw new WeixinApiError(
      `${operation} ${codes}: ${response.errmsg ?? "unknown error"}`,
      void 0,
      JSON.stringify(response),
      response.ret,
      response.errcode
    );
  }
  baseInfo() {
    return {
      channel_version: this.config.channelVersion,
      bot_agent: this.config.botAgent
    };
  }
  headers(token) {
    const randomUin = import_node_crypto.default.randomBytes(4).readUInt32BE(0);
    const [major = 0, minor = 0, patch = 0] = this.config.channelVersion.split(".").map((part) => Number.parseInt(part, 10) || 0);
    const clientVersion = (major & 255) << 16 | (minor & 255) << 8 | patch & 255;
    return {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": Buffer.from(String(randomUin), "utf8").toString("base64"),
      "iLink-App-Id": "bot",
      "iLink-App-ClientVersion": String(clientVersion),
      ...this.config.routeTag ? { SKRouteTag: this.config.routeTag } : {},
      ...token ? { Authorization: `Bearer ${token}` } : {}
    };
  }
  async request(baseUrl, endpoint, options) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? REGULAR_TIMEOUT_MS
    );
    const url = new URL(
      endpoint,
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
    );
    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers: this.headers(options.token),
        body: options.body,
        signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new WeixinApiError(
          `${options.method} ${url.pathname} failed with HTTP ${response.status}`,
          response.status,
          text
        );
      }
      if (options.allowEmptyResponse && text.trim() === "") return {};
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new WeixinApiError(
          `Invalid JSON from ${url.pathname}: ${String(error)}`,
          response.status,
          text.slice(0, 500)
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
  async legacyGet(baseUrl, endpoint, headers, timeoutMs = REGULAR_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = new URL(
      endpoint,
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
    );
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new WeixinApiError(
          `GET ${url.pathname} failed with HTTP ${response.status}`,
          response.status,
          text
        );
      }
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }
};

// src/weixin/delivery.ts
var globalDeliveryQueue = Promise.resolve();
var WeixinTextDelivery = class {
  constructor(sender, options = {}) {
    this.sender = sender;
    this.clientIdFactory = options.clientIdFactory ?? (() => `codelink-${(0, import_node_crypto2.randomUUID)()}`);
    this.interChunkDelayMs = options.interChunkDelayMs ?? 200;
    this.retryDelaysMs = options.retryDelaysMs ?? [250, 750];
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }
  clientIdFactory;
  interChunkDelayMs;
  retryDelaysMs;
  sleep;
  async sendText(input) {
    const delivery = globalDeliveryQueue.then(
      () => this.deliver(input),
      () => this.deliver(input)
    );
    globalDeliveryQueue = delivery.then(
      () => void 0,
      () => void 0
    );
    return delivery;
  }
  async deliver(input) {
    const chunks = splitTextForDelivery(input.text, 2048);
    const { deliveryKey, ...sendInput } = input;
    let deliveredText = "";
    for (const [index, chunk] of chunks.entries()) {
      try {
        const params = {
          ...sendInput,
          text: chunk.text,
          clientId: deliveryKey ? stableClientId(deliveryKey, index) : this.clientIdFactory()
        };
        if (index > 0 && this.interChunkDelayMs > 0) {
          await this.sleep(this.interChunkDelayMs);
        }
        await this.sendChunk(params);
        deliveredText += chunk.sourceText;
      } catch (error) {
        return {
          totalChunks: chunks.length,
          sentChunks: index,
          deliveredText,
          failedChunk: chunk.sourceText,
          failedChunkIndex: index,
          ...error instanceof WeixinApiError && error.errorCode !== void 0 ? { errorCode: error.errorCode } : {},
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    return {
      totalChunks: chunks.length,
      sentChunks: chunks.length,
      deliveredText
    };
  }
  async sendChunk(params) {
    let retry = 0;
    while (true) {
      try {
        await this.sender.sendText(params);
        return;
      } catch (error) {
        if (!(error instanceof WeixinApiError) || error.errorCode !== -2 || retry >= this.retryDelaysMs.length) {
          throw error;
        }
        await this.sleep(this.retryDelaysMs[retry]);
        retry += 1;
      }
    }
  }
};
function splitTextForDelivery(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return [{ text, sourceText: text }];
  }
  const fences = findFencedBlocks(text);
  if (!fences.some(
    (range) => Buffer.byteLength(text.slice(range.start, range.end), "utf8") > maxBytes
  )) {
    return splitUtf8Text(text, maxBytes).map((chunk) => ({
      text: chunk,
      sourceText: chunk
    }));
  }
  const chunks = [];
  let cursor = 0;
  for (const fence of fences) {
    if (fence.start > cursor) {
      chunks.push(
        ...splitUtf8Text(text.slice(cursor, fence.start), maxBytes).map(
          (chunk) => ({ text: chunk, sourceText: chunk })
        )
      );
    }
    const source = text.slice(fence.start, fence.end);
    chunks.push(
      ...Buffer.byteLength(source, "utf8") <= maxBytes ? [{ text: source, sourceText: source }] : splitOversizedFence(source, maxBytes)
    );
    cursor = fence.end;
  }
  if (cursor < text.length) {
    chunks.push(
      ...splitUtf8Text(text.slice(cursor), maxBytes).map((chunk) => ({
        text: chunk,
        sourceText: chunk
      }))
    );
  }
  return chunks;
}
function splitOversizedFence(source, maxBytes) {
  const openingEnd = source.indexOf("\n") + 1;
  const openingLine = openingEnd > 0 ? source.slice(0, openingEnd) : `${source}
`;
  const markerMatch = /^ {0,3}(`{3,}|~{3,})/.exec(openingLine);
  if (!markerMatch) {
    return splitUtf8Text(source, maxBytes).map((chunk) => ({
      text: chunk,
      sourceText: chunk
    }));
  }
  const marker = markerMatch[1];
  const rest = openingEnd > 0 ? source.slice(openingEnd) : "";
  const closingStart = findClosingFenceStart(rest, marker);
  const body = closingStart >= 0 ? rest.slice(0, closingStart) : rest;
  const originalClosing = closingStart >= 0 ? rest.slice(closingStart) : "";
  const syntheticClosing = `${marker}
`;
  const overhead = Buffer.byteLength(openingLine, "utf8") + Math.max(
    Buffer.byteLength(syntheticClosing, "utf8"),
    Buffer.byteLength(originalClosing, "utf8")
  );
  const bodyLimit = maxBytes - overhead;
  if (bodyLimit <= 0) {
    return splitUtf8Text(source, maxBytes).map((chunk) => ({
      text: chunk,
      sourceText: chunk
    }));
  }
  const pieces = splitRawUtf8Text(body, bodyLimit);
  return pieces.map((piece, index) => {
    const last = index === pieces.length - 1;
    return {
      text: `${openingLine}${piece}${last && originalClosing ? originalClosing : syntheticClosing}`,
      sourceText: `${index === 0 ? openingLine : ""}${piece}${last ? originalClosing : ""}`
    };
  });
}
function findClosingFenceStart(text, openingMarker) {
  let lineStart = 0;
  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (match && match[1][0] === openingMarker[0] && match[1].length >= openingMarker.length && line.slice(match[0].length).trim() === "") {
      return lineStart;
    }
    lineStart = lineEnd;
  }
  return -1;
}
function splitRawUtf8Text(text, maxBytes) {
  if (!text) return [""];
  const chunks = [];
  let current = "";
  let bytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (current && bytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current) chunks.push(current);
  return chunks;
}
function stableClientId(deliveryKey, chunkIndex) {
  const digest = (0, import_node_crypto2.createHash)("sha256").update(`${deliveryKey}:${chunkIndex}`).digest("hex").slice(0, 32);
  return `codelink-${digest}`;
}
function splitUtf8Text(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return [text];
  const chunks = [];
  const protectedBlocks = [
    ...findFencedBlocks(text),
    ...findListItems(text)
  ].sort((left, right) => left.start - right.start);
  let start = 0;
  while (start < text.length) {
    let bytes = 0;
    let end = start;
    let lastNewline = -1;
    let lastParagraph = -1;
    for (const character of text.slice(start)) {
      const nextBytes = bytes + Buffer.byteLength(character, "utf8");
      if (nextBytes > maxBytes) break;
      bytes = nextBytes;
      end += character.length;
      if (character === "\n") {
        lastNewline = end;
        if (text[end - 2] === "\n") lastParagraph = end;
      }
    }
    if (end === text.length) {
      chunks.push(text.slice(start));
      break;
    }
    const preferredSplit = lastParagraph > start ? lastParagraph : lastNewline > start ? lastNewline : end;
    const enclosingBlock = protectedBlocks.find(
      (block) => block.start < preferredSplit && preferredSplit < block.end
    );
    const splitAt = enclosingBlock && enclosingBlock.start > start && Buffer.byteLength(
      text.slice(enclosingBlock.start, enclosingBlock.end),
      "utf8"
    ) <= maxBytes ? enclosingBlock.start : preferredSplit;
    chunks.push(text.slice(start, splitAt));
    start = splitAt;
  }
  return chunks;
}
function findFencedBlocks(text) {
  const blocks = [];
  let open = null;
  let lineStart = 0;
  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = match[1];
      if (!open) {
        open = { start: lineStart, marker };
      } else if (marker[0] === open.marker[0] && marker.length >= open.marker.length && line.slice(match[0].length).trim() === "") {
        blocks.push({ start: open.start, end: lineEnd });
        open = null;
      }
    }
    lineStart = lineEnd;
  }
  if (open) blocks.push({ start: open.start, end: text.length });
  return blocks;
}
function findListItems(text) {
  const items = [];
  let itemStart;
  let lineStart = 0;
  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    const startsItem = /^ {0,3}(?:[-+*]|\d+[.)])\s+/.test(line);
    if (startsItem) {
      if (itemStart !== void 0) {
        items.push({ start: itemStart, end: lineStart });
      }
      itemStart = lineStart;
    } else if (itemStart !== void 0) {
      const isContinuation = /^(?: {2,}|\t)\S/.test(line);
      const isBlank = line.trim() === "";
      if (!isContinuation) {
        items.push({
          start: itemStart,
          end: isBlank ? lineEnd : lineStart
        });
        itemStart = void 0;
      }
    }
    lineStart = lineEnd;
  }
  if (itemStart !== void 0) {
    items.push({ start: itemStart, end: text.length });
  }
  return items;
}

// src/weixin/typing.ts
var TYPING_KEEPALIVE_MS = 5e3;
var TYPING_FAILURE_RETRY_MS = 6e4;
var TYPING_CANCEL_TIMEOUT_MS = 3e3;
var MAX_CONSECUTIVE_TYPING_FAILURES = 2;
var WeixinTypingIndicator = class {
  constructor(client) {
    this.client = client;
  }
  activities = /* @__PURE__ */ new Map();
  stopped = false;
  stopPromise;
  async during(target, work) {
    if (this.stopped) return work();
    const [key, activity] = this.acquire(target);
    try {
      return await work();
    } finally {
      await this.release(key, activity);
    }
  }
  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    const cancellations = [...this.activities.values()].map(
      async (activity) => {
        activity.closed = true;
        activity.references = 0;
        await this.closeActivity(activity);
      }
    );
    this.activities.clear();
    this.stopPromise = Promise.all(cancellations).then(() => void 0);
    return this.stopPromise;
  }
  acquire(target) {
    const key = JSON.stringify([
      target.session.baseUrl,
      target.session.accountId,
      target.toUserId
    ]);
    const existing = this.activities.get(key);
    if (existing && !existing.closing && !existing.closed) {
      existing.references += 1;
      existing.target = target;
      if (!existing.controller) this.start(existing);
      else if (existing.consecutiveFailures >= MAX_CONSECUTIVE_TYPING_FAILURES && existing.keepalive) {
        clearTimeout(existing.keepalive);
        existing.keepalive = void 0;
        void this.pulse(existing, existing.controller.signal);
      }
      return [key, existing];
    }
    const activity = {
      target,
      references: 1,
      updates: existing?.closing?.then(() => void 0) ?? Promise.resolve(),
      consecutiveFailures: 0,
      closed: false
    };
    this.activities.set(key, activity);
    this.start(activity);
    return [key, activity];
  }
  start(activity) {
    activity.consecutiveFailures = 0;
    activity.controller = new AbortController();
    const signal = activity.controller.signal;
    void this.pulse(activity, signal);
  }
  async pulse(activity, signal) {
    const succeeded = await this.update(
      activity,
      true,
      signal,
      activity.consecutiveFailures < MAX_CONSECUTIVE_TYPING_FAILURES
    );
    if (signal.aborted || activity.closed || activity.controller?.signal !== signal) {
      return;
    }
    activity.consecutiveFailures = succeeded ? 0 : activity.consecutiveFailures + 1;
    const retryDelay = activity.consecutiveFailures >= MAX_CONSECUTIVE_TYPING_FAILURES ? TYPING_FAILURE_RETRY_MS : TYPING_KEEPALIVE_MS;
    activity.keepalive = setTimeout(() => {
      activity.keepalive = void 0;
      void this.pulse(activity, signal);
    }, retryDelay);
    activity.keepalive.unref();
  }
  async release(key, activity) {
    if (activity.closed) return;
    activity.references = Math.max(0, activity.references - 1);
    if (activity.references > 0) return;
    await this.closeActivity(activity);
    if (activity.references === 0 && this.activities.get(key) === activity) {
      this.activities.delete(key);
    }
  }
  closeActivity(activity) {
    if (activity.closing) return activity.closing;
    activity.controller?.abort();
    activity.controller = void 0;
    if (activity.keepalive) clearTimeout(activity.keepalive);
    activity.keepalive = void 0;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TYPING_CANCEL_TIMEOUT_MS
    );
    timeout.unref();
    const cancellation = this.update(
      activity,
      false,
      controller.signal
    ).then(() => void 0);
    const deadline = new Promise((resolve) => {
      if (controller.signal.aborted) resolve();
      else controller.signal.addEventListener("abort", () => resolve(), {
        once: true
      });
    });
    activity.closing = Promise.race([cancellation, deadline]).finally(() => {
      clearTimeout(timeout);
      controller.abort();
    });
    return activity.closing;
  }
  update(activity, typing, signal, logErrors = true) {
    const result = activity.updates.then(
      () => this.setTypingBestEffort(
        activity.target,
        typing,
        signal,
        logErrors
      )
    );
    activity.updates = result.then(() => void 0);
    return result;
  }
  async setTypingBestEffort(target, typing, signal, logErrors = true) {
    if (!this.client.setTyping) return false;
    if (signal?.aborted) return false;
    try {
      await this.client.setTyping({ ...target, typing, signal });
      return true;
    } catch (error) {
      if (signal?.aborted) return false;
      if (logErrors) {
        process.stderr.write(
          `\u5FAE\u4FE1\u8F93\u5165\u72B6\u6001\u66F4\u65B0\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}
`
        );
      }
      return false;
    }
  }
};

// src/daemon.ts
var WeixinSessionExpiredError = class extends Error {
};
var CodelinkDaemon = class {
  constructor(config, store, client, taskRunner) {
    this.config = config;
    this.store = store;
    this.client = client;
    this.taskRunner = taskRunner;
    this.delivery = new WeixinTextDelivery(client);
    this.typing = new WeixinTypingIndicator(client);
    this.server = import_node_http.default.createServer((request, response) => {
      void this.handleHttp(request, response);
    });
  }
  server;
  delivery;
  typing;
  backgroundTasks = /* @__PURE__ */ new Set();
  pendingThreads = /* @__PURE__ */ new Map();
  stopping = false;
  pollingStartedAt;
  lastPollSuccessAt;
  lastPollErrorAt;
  lastPollError;
  degraded = false;
  sessionExpired = false;
  async start() {
    const session = this.requireSession();
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(
        this.config.daemon.port,
        this.config.daemon.host,
        () => resolve()
      );
    });
    process.stderr.write(
      `CodeLink daemon API: http://${this.config.daemon.host}:${this.config.daemon.port}
`
    );
    process.stderr.write("WeChat session: loaded\n");
    const recovered = this.recoverPendingTasks(session);
    const recoveredDeliveries = this.recoverPendingDeliveries(session);
    if (recovered > 0 || recoveredDeliveries > 0) {
      process.stderr.write(
        `\u6062\u590D\u672A\u5B8C\u6210\u7684 CodeLink \u4EFB\u52A1\uFF1A${recovered}\uFF0C\u5F85\u6295\u9012\u6D88\u606F\uFF1A${recoveredDeliveries}
`
      );
    }
    this.pollingStartedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.poll(session);
  }
  async stop() {
    this.stopping = true;
    await new Promise((resolve) => this.server.close(() => resolve()));
    const drained = await this.drainBackgroundTasks(5e3);
    await this.typing.stop();
    if (!drained) {
      process.stderr.write(
        "CodeLink \u5728 5 \u79D2\u5185\u672A\u5B8C\u6210\u5168\u90E8\u540E\u53F0\u4EFB\u52A1\uFF1B\u5DF2\u6301\u4E45\u5316\u7684\u4EFB\u52A1\u4F1A\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u6309\u5B89\u5168\u6062\u590D\u7B56\u7565\u5904\u7406\u3002\n"
      );
    }
  }
  async poll(session) {
    let cursor = this.store.loadSyncCursor();
    while (!this.stopping) {
      try {
        cursor = await this.pollOnce(session, cursor);
      } catch (error) {
        process.stderr.write(
          `\u5FAE\u4FE1\u8F6E\u8BE2\u9519\u8BEF\uFF1A${error instanceof Error ? error.message : String(error)}
`
        );
        if (error instanceof WeixinSessionExpiredError) {
          process.stderr.write(
            "\u5FAE\u4FE1\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8F6E\u8BE2\u5DF2\u6682\u505C\uFF1B\u8BF7\u91CD\u65B0\u8FD0\u884C codelink login \u540E\u91CD\u542F CodeLink \u670D\u52A1\u3002\n"
          );
          return;
        }
        if (!this.stopping) await delay(2e3);
      }
    }
  }
  async pollOnce(session, cursor) {
    try {
      const updates = await this.client.getUpdates(session, cursor);
      if (updates.errcode === -14) {
        throw new WeixinSessionExpiredError(
          "\u5FAE\u4FE1 bot token \u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u8FD0\u884C codelink login"
        );
      }
      if (updates.errcode && updates.errcode !== 0) {
        throw new Error(
          `getupdates errcode=${updates.errcode}: ${updates.errmsg ?? "unknown"}`
        );
      }
      if (updates.ret && updates.ret !== 0) {
        throw new Error(
          `getupdates ret=${updates.ret}: ${updates.errmsg ?? "unknown"}`
        );
      }
      for (const message of updates.msgs ?? []) {
        this.acceptIncomingMessage(session, message);
      }
      const nextCursor = typeof updates.get_updates_buf === "string" ? updates.get_updates_buf : cursor;
      if (nextCursor !== cursor) this.store.saveSyncCursor(nextCursor);
      this.lastPollSuccessAt = (/* @__PURE__ */ new Date()).toISOString();
      this.degraded = false;
      this.sessionExpired = false;
      return nextCursor;
    } catch (error) {
      this.degraded = true;
      this.sessionExpired = error instanceof WeixinSessionExpiredError;
      this.lastPollErrorAt = (/* @__PURE__ */ new Date()).toISOString();
      this.lastPollError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
  async handleIncomingMessage(session, message) {
    const completion = this.acceptIncomingMessage(session, message);
    if (completion) await completion;
  }
  acceptIncomingMessage(session, message) {
    if (message.message_type !== void 0 && message.message_type !== 1)
      return;
    const fromUserId = message.from_user_id?.trim();
    if (!fromUserId) return;
    const text = (message.item_list ?? []).filter((item) => item.type === 1).map((item) => item.text_item?.text?.trim() ?? "").filter(Boolean).join("\n");
    if (!text) return;
    const allowed = new Set(
      this.config.security.allowedUserIds.length > 0 ? this.config.security.allowedUserIds : session.userId ? [session.userId] : []
    );
    if (!allowed.has(fromUserId)) {
      process.stderr.write(`\u5FFD\u7565\u672A\u6388\u6743\u5FAE\u4FE1\u7528\u6237\uFF1A${fromUserId}
`);
      return;
    }
    if (message.context_token)
      this.store.saveContextToken(fromUserId, message.context_token);
    const messageId = String(
      message.message_id ?? message.seq ?? `${fromUserId}-${message.create_time_ms ?? Date.now()}`
    );
    if (this.store.findTask(messageId)) return;
    const contextToken = message.context_token || this.store.getContextToken(fromUserId)?.contextToken;
    if (text === "/status") {
      return contextToken ? this.trackBackground(
        this.deliverOperationalText(
          session,
          fromUserId,
          contextToken,
          this.renderStatus()
        )
      ) : void 0;
    }
    if (text === "/help") {
      return contextToken ? this.trackBackground(
        this.deliverOperationalText(
          session,
          fromUserId,
          contextToken,
          "CodeLink\uFF1A\u666E\u901A\u6D88\u606F\u7EE7\u7EED\u5F53\u524D Codex \u4F1A\u8BDD\uFF1B\u6CA1\u6709\u5F53\u524D\u4F1A\u8BDD\u65F6\u81EA\u52A8\u65B0\u5EFA\u3002\u53D1\u9001 /new\uFF0C\u6216\u76F4\u63A5\u8BF4\u201C\u5F00\u4E2A\u65B0\u4F1A\u8BDD\u201D\uFF0C\u5373\u53EF\u5207\u6362\u3002\u547D\u4EE4\uFF1A/status\u3001/help\u3002"
        )
      ) : void 0;
    }
    const conversationIntent = parseNewConversationIntent(text);
    if (conversationIntent.startNew) {
      this.store.clearConversation(fromUserId);
      this.pendingThreads.delete(fromUserId);
      if (!conversationIntent.prompt) {
        return contextToken ? this.trackBackground(
          this.deliverOperationalText(
            session,
            fromUserId,
            contextToken,
            "\u65B0\u4F1A\u8BDD\u5DF2\u5F00\u542F\uFF0C\u4E0A\u4E00\u4E2A\u4F1A\u8BDD\u7684\u4E0A\u4E0B\u6587\u4E0D\u4F1A\u5E26\u5165\u3002\u76F4\u63A5\u53D1\u9001\u4E0B\u4E00\u6761\u6D88\u606F\u5373\u53EF\u5F00\u59CB\u3002"
          )
        ) : void 0;
      }
    }
    const conversationSnapshot = this.store.getConversationSnapshot(fromUserId);
    const conversationAtReceipt = conversationSnapshot.binding;
    const pendingAtReceipt = conversationIntent.startNew ? void 0 : this.pendingThreads.get(fromUserId);
    const willCreateNewConversation = conversationIntent.startNew || !conversationAtReceipt && !pendingAtReceipt;
    const ownedPending = willCreateNewConversation ? this.createPendingThread(fromUserId, messageId) : void 0;
    const input = {
      messageId,
      fromUserId,
      prompt: conversationIntent.prompt,
      conversationAtReceipt,
      conversationGenerationAtReceipt: conversationSnapshot.generation,
      ...conversationIntent.startNew ? { startNew: true } : {},
      ...ownedPending ? { onThreadStarted: (threadId) => ownedPending.settle(threadId) } : {}
    };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (!this.store.acceptTask({
      messageId,
      fromUserId,
      prompt: conversationIntent.prompt,
      promptPreview: previewText(conversationIntent.prompt),
      ...conversationIntent.startNew ? { startNew: true } : {},
      conversationAtReceipt,
      conversationGenerationAtReceipt: conversationSnapshot.generation,
      status: "accepted",
      startedAt: now
    })) {
      return;
    }
    const execution = this.executeTask(
      session,
      input,
      contextToken,
      pendingAtReceipt?.promise,
      ownedPending
    );
    return this.trackBackground(execution);
  }
  recoverPendingTasks(session) {
    const records = this.store.listTasks(500).reverse().filter((task) => task.status === "accepted" || task.status === "running");
    let recovered = 0;
    for (const record of records) {
      const contextToken = this.store.getContextToken(
        record.fromUserId
      )?.contextToken;
      if (record.status === "running") {
        this.persistTaskFailure(
          record.messageId,
          `CodeLink \u5728\u4EFB\u52A1\u6267\u884C\u671F\u95F4\u91CD\u542F\uFF1B\u4E3A\u907F\u514D\u91CD\u590D\u6267\u884C\u53EF\u80FD\u4EA7\u751F\u526F\u4F5C\u7528\u7684\u8BF7\u6C42\uFF0C\u672A\u81EA\u52A8\u91CD\u653E\u3002${record.threadId ? `\u53EF\u7EE7\u7EED\u4F1A\u8BDD ${record.threadId}\uFF0C\u6216\u91CD\u65B0\u53D1\u9001\u8BF7\u6C42\u3002` : "\u8BF7\u91CD\u65B0\u53D1\u9001\u8BF7\u6C42\u3002"}`,
          contextToken
        );
        recovered += 1;
        continue;
      }
      if (typeof record.prompt !== "string") {
        this.persistTaskFailure(
          record.messageId,
          "CodeLink \u5347\u7EA7\u524D\u7684\u4EFB\u52A1\u7F3A\u5C11\u53EF\u6062\u590D\u8BF7\u6C42\u6B63\u6587\uFF0C\u8BF7\u91CD\u65B0\u53D1\u9001",
          contextToken
        );
        continue;
      }
      let conversationAtReceipt = record.conversationAtReceipt;
      let conversationGenerationAtReceipt = record.conversationGenerationAtReceipt ?? this.store.getConversationSnapshot(record.fromUserId).generation;
      let startNew = record.startNew;
      if (record.threadId) {
        const current = this.store.getConversationSnapshot(record.fromUserId);
        conversationAtReceipt = current.binding?.threadId === record.threadId ? current.binding : {
          threadId: record.threadId,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        conversationGenerationAtReceipt = current.generation;
        startNew = false;
      }
      if (startNew) this.pendingThreads.delete(record.fromUserId);
      const pendingAtReceipt = !startNew && !conversationAtReceipt ? this.pendingThreads.get(record.fromUserId) : void 0;
      const willCreateNewConversation = Boolean(startNew) || !conversationAtReceipt && !pendingAtReceipt;
      const ownedPending = willCreateNewConversation ? this.createPendingThread(record.fromUserId, record.messageId) : void 0;
      const input = {
        messageId: record.messageId,
        fromUserId: record.fromUserId,
        prompt: record.prompt,
        conversationAtReceipt,
        conversationGenerationAtReceipt,
        recover: true,
        ...startNew ? { startNew: true } : {},
        ...ownedPending ? {
          onThreadStarted: (threadId) => ownedPending.settle(threadId)
        } : {}
      };
      this.trackBackground(
        this.executeTask(
          session,
          input,
          contextToken,
          pendingAtReceipt?.promise,
          ownedPending
        )
      );
      recovered += 1;
    }
    return recovered;
  }
  recoverPendingDeliveries(session) {
    let recovered = 0;
    for (const task of this.store.listTasks(500).reverse()) {
      if (task.delivery?.acknowledgement?.status === "pending") {
        this.markTaskDeliverySkipped(task.messageId, "acknowledgement");
      }
      const pending = task.delivery?.result;
      if (pending?.status !== "pending") continue;
      const contextToken = this.store.getContextToken(
        task.fromUserId
      )?.contextToken;
      if (!contextToken || !pending.text) {
        this.store.updateTask(task.messageId, (current) => ({
          ...current,
          delivery: {
            ...current.delivery,
            result: {
              ...current.delivery?.result,
              status: contextToken ? "failed" : "skipped",
              updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
              ...!contextToken ? {} : { error: "\u6301\u4E45\u5316\u6295\u9012\u8BB0\u5F55\u7F3A\u5C11\u6D88\u606F\u6B63\u6587" }
            }
          }
        }));
        continue;
      }
      this.trackBackground(
        this.deliverTaskText(
          task.messageId,
          "result",
          session,
          task.fromUserId,
          contextToken,
          pending.text
        )
      );
      recovered += 1;
    }
    return recovered;
  }
  createPendingThread(userId, messageId) {
    let resolve;
    let settled = false;
    const promise = new Promise((done) => {
      resolve = done;
    });
    const pending = {
      messageId,
      promise,
      settle: (threadId) => {
        if (settled) return;
        settled = true;
        const current = this.store.getConversation(userId);
        resolve(
          threadId ? current?.threadId === threadId ? current : { threadId, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } : null
        );
        if (this.pendingThreads.get(userId) === pending) {
          this.pendingThreads.delete(userId);
        }
      }
    };
    this.pendingThreads.set(userId, pending);
    return pending;
  }
  executeTask(session, input, contextToken, routeAfter, ownedPending) {
    const work = () => this.executeTaskWork(
      session,
      input,
      contextToken,
      routeAfter,
      ownedPending
    );
    return contextToken ? this.typing.during(
      {
        session,
        toUserId: input.fromUserId,
        contextToken
      },
      work
    ) : work();
  }
  async executeTaskWork(session, input, contextToken, routeAfter, ownedPending) {
    const routedConversation = routeAfter ? await routeAfter ?? this.store.getConversation(input.fromUserId) : input.conversationAtReceipt;
    const routedInput = routeAfter ? { ...input, conversationAtReceipt: routedConversation } : input;
    const runnerInput = {
      ...routedInput,
      onResultReady: (readyResult) => {
        routedInput.onResultReady?.(readyResult);
        this.persistTaskResult(
          routedInput.messageId,
          readyResult,
          contextToken,
          routedInput.startNew === true
        );
      },
      onTaskFailed: (errorMessage) => {
        routedInput.onTaskFailed?.(errorMessage);
        this.persistTaskFailure(
          routedInput.messageId,
          errorMessage,
          contextToken
        );
      }
    };
    let result;
    try {
      result = await this.taskRunner.runTask(runnerInput);
      routedInput.onThreadStarted?.(result.threadId);
      this.persistTaskResult(
        routedInput.messageId,
        result,
        contextToken,
        routedInput.startNew === true
      );
    } catch (error) {
      ownedPending?.settle();
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.persistTaskFailure(
        routedInput.messageId,
        errorMessage,
        contextToken
      );
      if (!contextToken) {
        return;
      }
      await this.deliverTaskText(
        routedInput.messageId,
        "result",
        session,
        routedInput.fromUserId,
        contextToken,
        `\u4EFB\u52A1\u6267\u884C\u5931\u8D25\uFF1A${errorMessage}`
      );
      return;
    }
    if (!contextToken) {
      return;
    }
    await this.deliverTaskText(
      routedInput.messageId,
      "result",
      session,
      routedInput.fromUserId,
      contextToken,
      formatTaskExecutionResult(result, routedInput.startNew === true)
    );
  }
  persistTaskResult(messageId, result, contextToken, explicitlyStartedNew = false) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.store.updateTask(messageId, (current) => ({
      ...current,
      threadId: result.threadId,
      ...result.workspace ? { workspace: result.workspace } : {},
      prompt: void 0,
      conversationAtReceipt: void 0,
      conversationGenerationAtReceipt: void 0,
      startNew: void 0,
      status: "completed",
      completedAt: now,
      finalResponsePreview: previewText(result.finalResponse),
      delivery: {
        ...current.delivery,
        result: contextToken ? {
          status: "pending",
          updatedAt: now,
          text: formatTaskExecutionResult(result, explicitlyStartedNew),
          deliveryKey: taskDeliveryKey(messageId, "result")
        } : { status: "skipped", updatedAt: now }
      }
    }));
  }
  persistTaskFailure(messageId, errorMessage, contextToken) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const text = `\u4EFB\u52A1\u6267\u884C\u5931\u8D25\uFF1A${errorMessage}`;
    this.store.updateTask(messageId, (current) => ({
      ...current,
      prompt: void 0,
      conversationAtReceipt: void 0,
      conversationGenerationAtReceipt: void 0,
      startNew: void 0,
      status: "failed",
      completedAt: now,
      error: errorMessage,
      delivery: {
        ...current.delivery,
        result: contextToken ? {
          status: "pending",
          updatedAt: now,
          text,
          deliveryKey: taskDeliveryKey(messageId, "result")
        } : { status: "skipped", updatedAt: now }
      }
    }));
  }
  async deliverTaskText(messageId, stage, session, toUserId, contextToken, text) {
    const deliveryKey = this.store.findTask(messageId)?.delivery?.[stage]?.deliveryKey ?? taskDeliveryKey(messageId, stage);
    this.store.updateTask(messageId, (current) => ({
      ...current,
      delivery: {
        ...current.delivery,
        [stage]: {
          status: "pending",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          text,
          deliveryKey
        }
      }
    }));
    try {
      const receipt = await this.delivery.sendText({
        session,
        toUserId,
        contextToken,
        text,
        deliveryKey
      });
      this.recordTaskDelivery(messageId, stage, receipt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.updateTask(messageId, (current) => ({
        ...current,
        delivery: {
          ...current.delivery,
          [stage]: {
            status: "failed",
            updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            error: errorMessage,
            text,
            deliveryKey
          }
        }
      }));
      process.stderr.write(
        `\u5FAE\u4FE1\u6D88\u606F\u6295\u9012\u5931\u8D25\uFF08\u4EFB\u52A1 ${messageId}\uFF0C\u9636\u6BB5 ${stage}\uFF09\uFF1A${errorMessage}
`
      );
    }
  }
  recordTaskDelivery(messageId, stage, receipt) {
    const failed = receipt.sentChunks !== receipt.totalChunks;
    this.store.updateTask(messageId, (current) => {
      const pending = current.delivery?.[stage];
      return {
        ...current,
        delivery: {
          ...current.delivery,
          [stage]: {
            status: failed ? "failed" : "sent",
            updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            totalChunks: receipt.totalChunks,
            sentChunks: receipt.sentChunks,
            ...receipt.failedChunkIndex !== void 0 ? { failedChunkIndex: receipt.failedChunkIndex } : {},
            ...receipt.errorCode !== void 0 ? { errorCode: receipt.errorCode } : {},
            ...failed ? {
              error: receipt.error ?? `\u5FAE\u4FE1\u6295\u9012\u672A\u5B8C\u6210\uFF08${receipt.sentChunks}/${receipt.totalChunks} \u6BB5\uFF09`,
              ...pending?.text ? { text: pending.text } : {},
              ...pending?.deliveryKey ? { deliveryKey: pending.deliveryKey } : {}
            } : {}
          }
        }
      };
    });
    if (failed) {
      process.stderr.write(
        `\u5FAE\u4FE1\u6D88\u606F\u6295\u9012\u672A\u5B8C\u6210\uFF08\u4EFB\u52A1 ${messageId}\uFF0C\u9636\u6BB5 ${stage}\uFF0C\u5DF2\u53D1\u9001 ${receipt.sentChunks}/${receipt.totalChunks} \u6BB5\uFF09\u3002
`
      );
    }
  }
  markTaskDeliverySkipped(messageId, stage) {
    this.store.updateTask(messageId, (current) => ({
      ...current,
      delivery: {
        ...current.delivery,
        [stage]: {
          status: "skipped",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    }));
  }
  async deliverOperationalText(session, toUserId, contextToken, text) {
    try {
      const receipt = await this.delivery.sendText({
        session,
        toUserId,
        contextToken,
        text
      });
      if (receipt.sentChunks !== receipt.totalChunks) {
        process.stderr.write("\u5FAE\u4FE1\u64CD\u4F5C\u6D88\u606F\u672A\u80FD\u5B8C\u6574\u6295\u9012\u3002\n");
      }
    } catch (error) {
      process.stderr.write(
        `\u5FAE\u4FE1\u64CD\u4F5C\u6D88\u606F\u6295\u9012\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}
`
      );
    }
  }
  trackBackground(promise) {
    const tracked = promise.catch((error) => {
      process.stderr.write(
        `CodeLink \u540E\u53F0\u4EFB\u52A1\u9519\u8BEF\uFF1A${error instanceof Error ? error.message : String(error)}
`
      );
    });
    this.backgroundTasks.add(tracked);
    tracked.then(
      () => this.backgroundTasks.delete(tracked),
      () => this.backgroundTasks.delete(tracked)
    );
    return tracked;
  }
  async waitForIdle() {
    while (this.backgroundTasks.size > 0) {
      await Promise.all([...this.backgroundTasks]);
    }
  }
  async drainBackgroundTasks(timeoutMs) {
    if (this.backgroundTasks.size === 0) return true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void this.waitForIdle().then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }
  async handleHttp(request, response) {
    try {
      if (request.method === "GET" && request.url === "/health") {
        const status = this.getStatus();
        return this.json(response, status.ok ? 200 : 503, status);
      }
      if (request.method === "GET" && request.url === "/healthz") {
        const status = this.getStatus();
        return this.json(response, status.ok ? 200 : 503, {
          service: "codelink",
          ok: status.ok,
          degraded: status.degraded,
          sessionExpired: status.sessionExpired
        });
      }
      if (request.method === "GET" && request.url?.startsWith("/tasks")) {
        return this.json(response, 200, { tasks: this.getRecentTasks() });
      }
      if (request.method === "POST" && request.url === "/send") {
        const body = await readJsonBody(request);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
        if (!text)
          return this.json(response, 400, {
            ok: false,
            error: "text is required"
          });
        const result = await this.sendNotification(
          text,
          userId || void 0,
          threadId || void 0
        );
        return this.json(response, 200, result);
      }
      return this.json(response, 404, { ok: false, error: "not found" });
    } catch (error) {
      return this.json(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  getStatus() {
    const session = this.store.loadSession();
    const ownerUserId = session?.userId;
    const activeThreadId = ownerUserId ? this.store.getConversation(ownerUserId)?.threadId : void 0;
    return {
      ok: Boolean(session && this.lastPollSuccessAt && !this.degraded),
      degraded: this.degraded,
      sessionExpired: this.sessionExpired,
      accountId: session?.accountId,
      ownerUserId,
      allowedUserIds: this.config.security.allowedUserIds,
      hasDefaultContextToken: Boolean(
        ownerUserId && this.store.getContextToken(ownerUserId)
      ),
      ...activeThreadId ? { activeThreadId } : {},
      recentTasks: this.store.listTasks(500).length,
      activeTasks: this.backgroundTasks.size,
      ...this.pollingStartedAt ? { pollingStartedAt: this.pollingStartedAt } : {},
      ...this.lastPollSuccessAt ? { lastPollSuccessAt: this.lastPollSuccessAt } : {},
      ...this.lastPollErrorAt ? { lastPollErrorAt: this.lastPollErrorAt } : {},
      ...this.lastPollError ? { lastPollError: this.lastPollError } : {}
    };
  }
  renderStatus() {
    const status = this.getStatus();
    return [
      `CodeLink: ${status.ok ? "\u8FD0\u884C\u4E2D" : status.sessionExpired ? "\u5FAE\u4FE1\u767B\u5F55\u5DF2\u5931\u6548" : status.degraded ? "\u8F6E\u8BE2\u5F02\u5E38" : "\u672A\u5C31\u7EEA"}`,
      `\u8D26\u53F7: ${status.accountId ?? "\u672A\u767B\u5F55"}`,
      `\u9ED8\u8BA4\u901A\u77E5\u4E0A\u4E0B\u6587: ${status.hasDefaultContextToken ? "\u53EF\u7528" : "\u5C1A\u672A\u5EFA\u7ACB"}`,
      `\u5F53\u524D Codex \u4F1A\u8BDD: ${status.activeThreadId ?? "\u5C1A\u672A\u7ED1\u5B9A"}`,
      `\u540E\u53F0\u4EFB\u52A1: ${status.activeTasks}`,
      `\u4EFB\u52A1\u8BB0\u5F55: ${status.recentTasks}`
    ].join("\n");
  }
  getRecentTasks(limit = 20) {
    return this.store.listTasks(limit).map(toPublicTaskRecord);
  }
  async sendNotification(text, explicitUserId, requestedThreadId) {
    const session = this.requireSession();
    const toUserId = explicitUserId || session.userId;
    if (!toUserId)
      throw new Error("\u6CA1\u6709\u9ED8\u8BA4\u5FAE\u4FE1\u7528\u6237\uFF1B\u8BF7\u5148\u626B\u7801\u767B\u5F55\u5E76\u4ECE\u5FAE\u4FE1\u53D1\u9001\u4E00\u6761\u6D88\u606F");
    const allowed = new Set(
      this.config.security.allowedUserIds.length ? this.config.security.allowedUserIds : [session.userId].filter(Boolean)
    );
    if (!allowed.has(toUserId))
      throw new Error(`\u7528\u6237 ${toUserId} \u4E0D\u5728 allowedUserIds \u4E2D`);
    const context = this.store.getContextToken(toUserId);
    if (!context)
      throw new Error(
        "\u6CA1\u6709\u53EF\u7528\u7684 context_token\uFF1B\u8BF7\u5148\u4ECE\u76EE\u6807\u5FAE\u4FE1\u8D26\u53F7\u5411 CodeLink \u53D1\u9001\u4E00\u6761\u6D88\u606F"
      );
    const threadId = isCodexThreadId(requestedThreadId) ? requestedThreadId : void 0;
    const previousBinding = this.store.getConversation(toUserId);
    if (threadId) this.store.bindConversation(toUserId, { threadId });
    const notificationBinding = threadId ? this.store.getConversation(toUserId) : null;
    try {
      const receipt = await this.delivery.sendText({
        session,
        toUserId,
        contextToken: context.contextToken,
        text: formatTaskNotification(text, Boolean(threadId))
      });
      if (receipt.sentChunks !== receipt.totalChunks) {
        throw new Error(
          receipt.error ?? `\u5FAE\u4FE1\u901A\u77E5\u672A\u5B8C\u6574\u6295\u9012\uFF08\u5DF2\u53D1\u9001 ${receipt.sentChunks} \u6BB5\uFF09`
        );
      }
    } catch (error) {
      if (threadId && notificationBinding) {
        this.store.replaceConversationIfUnchanged(
          toUserId,
          notificationBinding,
          previousBinding
        );
      }
      throw error;
    }
    return {
      ok: true,
      toUserId,
      conversationBound: Boolean(threadId),
      ...threadId ? { threadId } : {}
    };
  }
  requireSession() {
    const session = this.store.loadSession();
    if (!session?.token) throw new Error("\u672A\u767B\u5F55\u5FAE\u4FE1\uFF0C\u8BF7\u5148\u8FD0\u884C codelink login");
    return session;
  }
  json(response, status, value) {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify(value));
  }
};
async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("request body must be an object");
  return value;
}
function formatTaskNotification(text, conversationBound) {
  const footer = conversationBound ? "\u2014\u2014 CodeLink \u4EFB\u52A1\u901A\u77E5\n\u6B64\u4EFB\u52A1\u5DF2\u8BBE\u4E3A\u5FAE\u4FE1\u5F53\u524D Codex \u4F1A\u8BDD\uFF1B\u53EF\u76F4\u63A5\u56DE\u590D\u7EE7\u7EED\uFF0C\u53D1\u9001 /new \u6216\u76F4\u63A5\u8BF4\u201C\u5F00\u4E2A\u65B0\u4F1A\u8BDD\u201D\u5F00\u59CB\u65B0\u4F1A\u8BDD\u3002" : "\u2014\u2014 CodeLink \u4EFB\u52A1\u901A\u77E5\n\u672C\u901A\u77E5\u672A\u5207\u6362\u5F53\u524D Codex \u4F1A\u8BDD\uFF1B\u56DE\u590D\u5C06\u7EE7\u7EED\u6B64\u524D\u5DF2\u7ED1\u5B9A\u7684\u4F1A\u8BDD\uFF08\u5982\u6709\uFF09\uFF0C\u53D1\u9001 /new \u5F00\u59CB\u65B0\u4F1A\u8BDD\u3002";
  return `${text.trim()}

${footer}`;
}
function previewText(value, max = 500) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}\u2026`;
}
function toPublicTaskRecord(task) {
  const {
    prompt: _prompt,
    conversationAtReceipt: _conversationAtReceipt,
    conversationGenerationAtReceipt: _conversationGenerationAtReceipt,
    startNew: _startNew,
    delivery,
    ...visible
  } = task;
  return {
    ...visible,
    ...delivery ? {
      delivery: {
        ...delivery.acknowledgement ? {
          acknowledgement: toPublicDeliveryRecord(
            delivery.acknowledgement
          )
        } : {},
        ...delivery.result ? { result: toPublicDeliveryRecord(delivery.result) } : {}
      }
    } : {}
  };
}
function toPublicDeliveryRecord(delivery) {
  const { text: _text, deliveryKey: _deliveryKey, ...visible } = delivery;
  return visible;
}
function formatTaskExecutionResult(result, explicitlyStartedNew = false) {
  return explicitlyStartedNew ? `\u65B0\u4F1A\u8BDD\u5DF2\u5F00\u542F\uFF0C\u4E0A\u4E00\u4E2A\u4F1A\u8BDD\u7684\u4E0A\u4E0B\u6587\u4E0D\u4F1A\u5E26\u5165\u3002

${result.finalResponse}` : result.finalResponse;
}
function taskDeliveryKey(messageId, stage) {
  return `task:${messageId}:${stage}`;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/daemon-client.ts
var DaemonClient = class {
  baseUrl;
  fetchImpl;
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? process.env.CODELINK_DAEMON_URL ?? "http://127.0.0.1:18791";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  async status() {
    return this.request("/health", { method: "GET" }, true);
  }
  async health() {
    return this.request("/healthz", { method: "GET" }, true);
  }
  async recentTasks() {
    return this.request("/tasks", { method: "GET" });
  }
  async send(request) {
    return this.request("/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: request.text,
        ...request.userId ? { userId: request.userId } : {},
        ...request.threadId ? { threadId: request.threadId } : {}
      })
    });
  }
  async request(pathname, init, returnErrorBody = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1e4);
    try {
      const response = await this.fetchImpl(new URL(pathname, this.baseUrl), {
        ...init,
        signal: controller.signal
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: text || `HTTP ${response.status}` };
      }
      if (!response.ok && !returnErrorBody) {
        const error = data && typeof data === "object" && "error" in data ? String(data.error) : `HTTP ${response.status}`;
        throw new Error(error);
      }
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("CodeLink daemon \u8BF7\u6C42\u8D85\u65F6");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
};

// src/doctor.ts
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_crypto3 = require("node:crypto");
function createDoctorReport(params) {
  const status = asRecord(params.daemonStatus);
  const receipt = params.store.loadInstallReceipt();
  const runtimeReady = validateRuntime(params.store.path("runtime"));
  const plugin = validatePlugin(receipt);
  const pluginInstalled = plugin.installed;
  const mcpBundleReady = plugin.mcpReady;
  const daemonHealthy = status?.ok === true;
  const wechatLoggedIn = Boolean(params.store.loadSession()) && status?.sessionExpired !== true;
  const defaultRecipientReady = status?.hasDefaultContextToken === true;
  const currentConversationBound = typeof status?.activeThreadId === "string" && status.activeThreadId.length > 0;
  return {
    ok: runtimeReady && pluginInstalled && mcpBundleReady && daemonHealthy && wechatLoggedIn,
    runtimeReady,
    pluginInstalled,
    mcpBundleReady,
    daemonHealthy,
    wechatLoggedIn,
    defaultRecipientReady,
    currentConversationBound,
    newTaskRequired: true
  };
}
function validateRuntime(runtimeDir) {
  try {
    const manifest = asRecord(
      JSON.parse(
        import_node_fs3.default.readFileSync(import_node_path2.default.join(runtimeDir, "runtime-manifest.json"), "utf8")
      )
    );
    const files = asRecord(manifest?.files);
    if (manifest?.schemaVersion !== 1 || !files) return false;
    for (const name of ["cli.cjs", "mcp.js"]) {
      const expected = files[name];
      if (typeof expected !== "string") return false;
      const actual = (0, import_node_crypto3.createHash)("sha256").update(import_node_fs3.default.readFileSync(import_node_path2.default.join(runtimeDir, name))).digest("hex");
      if (actual !== expected) return false;
    }
    return true;
  } catch {
    return false;
  }
}
function validatePlugin(receipt) {
  if (receipt?.schemaVersion !== 1 || receipt.pluginInstalled !== true || receipt.mcpBundleReady !== true || typeof receipt.pluginRoot !== "string" || typeof receipt.pluginVersion !== "string" || typeof receipt.mcpSha256 !== "string") {
    return { installed: false, mcpReady: false };
  }
  try {
    const manifest = asRecord(
      JSON.parse(
        import_node_fs3.default.readFileSync(
          import_node_path2.default.join(receipt.pluginRoot, ".codex-plugin", "plugin.json"),
          "utf8"
        )
      )
    );
    const installed = manifest?.name === "codelink" && manifest.version === receipt.pluginVersion;
    if (!installed) return { installed: false, mcpReady: false };
    const mcp = asRecord(
      JSON.parse(
        import_node_fs3.default.readFileSync(import_node_path2.default.join(receipt.pluginRoot, ".mcp.json"), "utf8")
      )
    );
    const servers = asRecord(mcp?.mcpServers);
    const codelink = asRecord(servers?.codelink);
    const args = Array.isArray(codelink?.args) ? codelink.args : [];
    const mcpPath = import_node_path2.default.join(receipt.pluginRoot, "dist", "mcp.js");
    const mcpHash = (0, import_node_crypto3.createHash)("sha256").update(import_node_fs3.default.readFileSync(mcpPath)).digest("hex");
    const mcpReady = codelink?.command === "node" && args.includes("./dist/mcp.js") && mcpHash === receipt.mcpSha256;
    return { installed: true, mcpReady };
  } catch {
    return { installed: false, mcpReady: false };
  }
}
function asRecord(value) {
  return value && typeof value === "object" ? value : null;
}

// src/openclaw-state.ts
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
function exportOpenClawState(params) {
  const stateDir = import_node_path3.default.resolve(
    params.stateDir || process.env.OPENCLAW_STATE_DIR || import_node_path3.default.join(import_node_os.default.homedir(), ".openclaw")
  );
  const accountsDir = import_node_path3.default.join(stateDir, "openclaw-weixin", "accounts");
  const accountId = params.accountId || selectAccountId(stateDir, accountsDir);
  const accountPath = import_node_path3.default.join(accountsDir, `${accountId}.json`);
  const account = readObject(accountPath);
  const token = stringValue(account.token);
  if (!token) throw new Error(`OpenClaw \u8D26\u53F7\u6587\u4EF6\u7F3A\u5C11 token\uFF1A${accountPath}`);
  const sync = readObject(
    import_node_path3.default.join(accountsDir, `${accountId}.sync.json`),
    true
  );
  const contextTokens = readStringMap(
    import_node_path3.default.join(accountsDir, `${accountId}.context-tokens.json`)
  );
  const openclawConfig = readObject(import_node_path3.default.join(stateDir, "openclaw.json"), true);
  const channel = readChannelConfig(openclawConfig, accountId);
  const bundle = {
    schemaVersion: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "openclaw-weixin",
    account: {
      accountId,
      token,
      baseUrl: stringValue(account.baseUrl) || stringValue(channel.account.baseUrl) || stringValue(channel.section.baseUrl) || "https://ilinkai.weixin.qq.com",
      ...stringValue(account.userId) ? { userId: stringValue(account.userId) } : {},
      ...stringValue(account.savedAt) ? { savedAt: stringValue(account.savedAt) } : {}
    },
    ...stringValue(sync.get_updates_buf) ? { getUpdatesBuf: stringValue(sync.get_updates_buf) } : {},
    ...Object.keys(contextTokens).length ? { contextTokens } : {},
    ...stringValue(channel.account.routeTag) || stringValue(channel.section.routeTag) ? {
      routeTag: stringValue(channel.account.routeTag) || stringValue(channel.section.routeTag)
    } : {},
    ...stringValue(channel.account.botAgent) || stringValue(channel.section.botAgent) ? {
      botAgent: stringValue(channel.account.botAgent) || stringValue(channel.section.botAgent)
    } : {}
  };
  const outputPath = import_node_path3.default.resolve(params.outputPath);
  import_node_fs4.default.mkdirSync(import_node_path3.default.dirname(outputPath), { recursive: true, mode: 448 });
  import_node_fs4.default.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}
`, {
    encoding: "utf8",
    mode: 384
  });
  try {
    import_node_fs4.default.chmodSync(outputPath, 384);
  } catch {
  }
  return bundle;
}
function importOpenClawState(params) {
  const inputPath = import_node_path3.default.resolve(params.inputPath);
  const bundle = JSON.parse(
    import_node_fs4.default.readFileSync(inputPath, "utf8")
  );
  validateBundle(bundle);
  const session = {
    accountId: normalizeAccountId(bundle.account.accountId),
    token: bundle.account.token,
    baseUrl: normalizeBaseUrl(bundle.account.baseUrl),
    ...bundle.account.userId ? { userId: bundle.account.userId } : {},
    savedAt: bundle.account.savedAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  params.store.saveSession(session);
  if (bundle.getUpdatesBuf !== void 0) {
    params.store.saveSyncCursor(bundle.getUpdatesBuf);
  }
  const contextTokensImported = params.store.importContextTokens(
    bundle.contextTokens ?? {}
  );
  const config = params.store.loadConfig();
  if (bundle.routeTag) config.weixin.routeTag = bundle.routeTag;
  if (bundle.botAgent) config.weixin.botAgent = bundle.botAgent;
  if (session.userId && !config.security.allowedUserIds.includes(session.userId)) {
    config.security.allowedUserIds.push(session.userId);
  }
  params.store.saveConfig(config);
  return {
    accountId: session.accountId,
    ...session.userId ? { userId: session.userId } : {},
    tokenPresent: true,
    syncCursorImported: bundle.getUpdatesBuf !== void 0,
    contextTokensImported,
    routeTagImported: Boolean(bundle.routeTag),
    sourceFile: inputPath
  };
}
function selectAccountId(stateDir, accountsDir) {
  const indexPath = import_node_path3.default.join(stateDir, "openclaw-weixin", "accounts.json");
  try {
    const index = JSON.parse(import_node_fs4.default.readFileSync(indexPath, "utf8"));
    if (Array.isArray(index)) {
      const ids = index.filter(
        (value) => typeof value === "string" && value.trim().length > 0
      );
      if (ids.length) return ids[ids.length - 1];
    }
  } catch {
  }
  let candidates = [];
  try {
    candidates = import_node_fs4.default.readdirSync(accountsDir).filter(
      (name) => name.endsWith(".json") && !name.endsWith(".sync.json") && !name.endsWith(".context-tokens.json")
    ).sort(
      (a, b) => import_node_fs4.default.statSync(import_node_path3.default.join(accountsDir, a)).mtimeMs - import_node_fs4.default.statSync(import_node_path3.default.join(accountsDir, b)).mtimeMs
    );
  } catch {
  }
  if (!candidates.length) {
    throw new Error(`\u672A\u627E\u5230 OpenClaw \u5FAE\u4FE1\u8D26\u53F7\u72B6\u6001\uFF1A${accountsDir}`);
  }
  return candidates[candidates.length - 1].replace(/\.json$/, "");
}
function readChannelConfig(config, accountId) {
  const channels = objectValue(config.channels);
  const section = objectValue(channels["openclaw-weixin"]);
  const accounts = objectValue(section.accounts);
  return { section, account: objectValue(accounts[accountId]) };
}
function readObject(filePath, optional = false) {
  try {
    return objectValue(JSON.parse(import_node_fs4.default.readFileSync(filePath, "utf8")));
  } catch (error) {
    if (optional) return {};
    throw new Error(`\u65E0\u6CD5\u8BFB\u53D6 ${filePath}: ${String(error)}`);
  }
}
function readStringMap(filePath) {
  const value = readObject(filePath, true);
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry) => typeof entry[1] === "string" && entry[1].length > 0
    )
  );
}
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
function validateBundle(bundle) {
  if (bundle.schemaVersion !== 1 || bundle.source !== "openclaw-weixin") {
    throw new Error("\u4E0D\u652F\u6301\u7684 OpenClaw \u5FAE\u4FE1\u72B6\u6001\u5305\u683C\u5F0F");
  }
  if (!bundle.account?.accountId || !bundle.account?.token || !bundle.account?.baseUrl) {
    throw new Error("\u72B6\u6001\u5305\u7F3A\u5C11 accountId\u3001token \u6216 baseUrl");
  }
}
function normalizeAccountId(value) {
  return value.trim().replaceAll("@", "-").replaceAll(".", "-").replace(/[^A-Za-z0-9_-]/g, "-");
}
function normalizeBaseUrl(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

// src/state.ts
var import_node_fs5 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);

// src/config.ts
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
function resolveStateDir() {
  return process.env.CODELINK_STATE_DIR?.trim() || import_node_path4.default.join(import_node_os2.default.homedir(), ".codelink");
}
function defaultConfig() {
  return {
    daemon: {
      host: "127.0.0.1",
      port: 18791
    },
    weixin: {
      baseUrl: "https://ilinkai.weixin.qq.com",
      botType: "3",
      channelVersion: "2.4.6",
      botAgent: "CodeLink/0.1.0"
    },
    codex: {
      taskWorkspaceRoot: import_node_path4.default.join(
        import_node_os2.default.homedir(),
        "Documents",
        "Codex",
        "CodeLink"
      ),
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: false
    },
    security: {
      allowedUserIds: []
    }
  };
}
function mergeConfig(base, value) {
  return {
    daemon: { ...base.daemon, ...value.daemon },
    weixin: { ...base.weixin, ...value.weixin },
    codex: { ...base.codex, ...value.codex },
    security: { ...base.security, ...value.security }
  };
}
function parseConfig(value) {
  if (!value || typeof value !== "object") return defaultConfig();
  return mergeConfig(defaultConfig(), value);
}

// src/state.ts
var StateStore = class {
  dir;
  constructor(dir = resolveStateDir()) {
    this.dir = dir;
  }
  ensure() {
    import_node_fs5.default.mkdirSync(this.dir, { recursive: true, mode: 448 });
    try {
      import_node_fs5.default.chmodSync(this.dir, 448);
    } catch {
    }
  }
  path(name) {
    return import_node_path5.default.join(this.dir, name);
  }
  loadConfig() {
    return parseConfig(this.readJson("config.json"));
  }
  saveConfig(config) {
    this.writeJson("config.json", config, 384);
  }
  loadSession() {
    return this.readJson("weixin-session.json");
  }
  saveSession(session) {
    this.writeJson("weixin-session.json", session, 384);
  }
  loadInstallReceipt() {
    return this.readJson("install-receipt.json");
  }
  saveInstallReceipt(receipt) {
    this.writeJson("install-receipt.json", receipt, 384);
  }
  loadSyncCursor() {
    const data = this.readJson("get-updates.json");
    return typeof data?.get_updates_buf === "string" ? data.get_updates_buf : "";
  }
  saveSyncCursor(cursor) {
    this.writeJson("get-updates.json", { get_updates_buf: cursor }, 384);
  }
  loadContextTokens() {
    const data = this.readJson("context-tokens.json");
    return data && typeof data === "object" ? data : {};
  }
  saveContextToken(userId, contextToken) {
    const tokens = this.loadContextTokens();
    tokens[userId] = { contextToken, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.writeJson("context-tokens.json", tokens, 384);
  }
  importContextTokens(tokens) {
    const existing = this.loadContextTokens();
    let count = 0;
    for (const [userId, contextToken] of Object.entries(tokens)) {
      if (!userId.trim() || !contextToken.trim()) continue;
      existing[userId] = {
        contextToken,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      count += 1;
    }
    this.writeJson("context-tokens.json", existing, 384);
    return count;
  }
  getContextToken(userId) {
    return this.loadContextTokens()[userId] ?? null;
  }
  getConversation(userId) {
    return this.loadConversationState().conversations[userId] ?? null;
  }
  getConversationSnapshot(userId) {
    const state = this.loadConversationState();
    return {
      binding: state.conversations[userId] ?? null,
      generation: state.generations[userId] ?? 0
    };
  }
  bindConversation(userId, binding) {
    const state = this.loadConversationState();
    const current = state.conversations[userId] ?? null;
    state.conversations[userId] = {
      threadId: binding.threadId,
      updatedAt: nextConversationUpdatedAt(current)
    };
    state.generations[userId] = (state.generations[userId] ?? 0) + 1;
    this.writeJson("conversations.json", state, 384);
  }
  bindConversationIfUnchanged(userId, expected, threadId, expectedGeneration) {
    return this.replaceConversationIfUnchanged(
      userId,
      expected,
      { threadId },
      expectedGeneration
    );
  }
  replaceConversationIfUnchanged(userId, expected, replacement, expectedGeneration) {
    const state = this.loadConversationState();
    const current = state.conversations[userId] ?? null;
    if (expectedGeneration !== void 0 && (state.generations[userId] ?? 0) !== expectedGeneration)
      return false;
    if (!sameConversationBinding(current, expected)) return false;
    if (replacement) {
      state.conversations[userId] = {
        threadId: replacement.threadId,
        updatedAt: nextConversationUpdatedAt(current)
      };
    } else {
      delete state.conversations[userId];
    }
    state.generations[userId] = (state.generations[userId] ?? 0) + 1;
    this.writeJson("conversations.json", state, 384);
    return true;
  }
  clearConversation(userId) {
    const state = this.loadConversationState();
    delete state.conversations[userId];
    state.generations[userId] = (state.generations[userId] ?? 0) + 1;
    this.writeJson("conversations.json", state, 384);
  }
  listTasks(limit = 20) {
    const state = this.loadTaskState();
    return state.tasks.slice(-Math.max(1, limit)).reverse();
  }
  findTask(messageId) {
    return this.loadTaskState().tasks.find((task) => task.messageId === messageId) ?? null;
  }
  acceptTask(record) {
    const state = this.loadTaskState();
    if (state.tasks.some((task) => task.messageId === record.messageId))
      return false;
    state.tasks.push(record);
    state.tasks = state.tasks.slice(-500);
    this.writeJson("tasks.json", state, 384);
    return true;
  }
  updateTask(messageId, update) {
    const state = this.loadTaskState();
    const index = state.tasks.findIndex(
      (task) => task.messageId === messageId
    );
    if (index < 0) return null;
    const next = update(state.tasks[index]);
    state.tasks[index] = next;
    this.writeJson("tasks.json", state, 384);
    return next;
  }
  upsertTask(record) {
    const state = this.loadTaskState();
    const index = state.tasks.findIndex(
      (task) => task.messageId === record.messageId
    );
    if (index >= 0) state.tasks[index] = record;
    else state.tasks.push(record);
    state.tasks = state.tasks.slice(-500);
    this.writeJson("tasks.json", state, 384);
  }
  loadTaskState() {
    const data = this.readJson("tasks.json");
    return { tasks: Array.isArray(data?.tasks) ? data.tasks : [] };
  }
  loadConversationState() {
    const data = this.readJson("conversations.json");
    return {
      conversations: data?.conversations && typeof data.conversations === "object" ? data.conversations : {},
      generations: data?.generations && typeof data.generations === "object" ? data.generations : {}
    };
  }
  readJson(name) {
    this.ensure();
    try {
      return JSON.parse(import_node_fs5.default.readFileSync(this.path(name), "utf8"));
    } catch {
      return null;
    }
  }
  writeJson(name, value, mode) {
    this.ensure();
    const destination = this.path(name);
    const temporary = `${destination}.${process.pid}.tmp`;
    import_node_fs5.default.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}
`, {
      encoding: "utf8",
      mode
    });
    import_node_fs5.default.renameSync(temporary, destination);
    try {
      import_node_fs5.default.chmodSync(destination, mode);
    } catch {
    }
  }
};
function sameConversationBinding(left, right) {
  if (!left || !right) return left === right;
  return left.threadId === right.threadId && left.updatedAt === right.updatedAt;
}
function nextConversationUpdatedAt(current) {
  const previous = current ? Date.parse(current.updatedAt) : Number.NaN;
  const timestamp = Number.isFinite(previous) ? Math.max(Date.now(), previous + 1) : Date.now();
  return new Date(timestamp).toISOString();
}

// src/weixin/login.ts
var import_node_fs6 = __toESM(require("node:fs"), 1);
var import_promises = __toESM(require("node:readline/promises"), 1);
var import_qrcode = __toESM(require_lib(), 1);
var import_qrcode_terminal = __toESM(require_main(), 1);
async function loginWithQr(params) {
  const existing = params.store.loadSession();
  const qrPath = params.store.path("login-qr.png");
  params.store.ensure();
  const requestQr = () => params.legacyGet ? params.client.getQrCodeLegacy() : params.client.getQrCode(existing?.token ? [existing.token] : []);
  const publishQr = async (qrContent) => {
    await import_qrcode.default.toFile(qrPath, qrContent, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512
    });
    try {
      import_node_fs6.default.chmodSync(qrPath, 384);
    } catch {
    }
    const qrOutput = params.qrOutput ?? "both";
    if (qrOutput === "terminal" || qrOutput === "both") {
      import_qrcode_terminal.default.generate(qrContent, { small: true });
    }
    process.stdout.write(`
\u4E8C\u7EF4\u7801\u6587\u4EF6\uFF1A${qrPath}
`);
    process.stdout.write(
      `\u767B\u5F55\u534F\u8BAE\uFF1A${params.legacyGet ? "legacy GET" : "official POST"}
`
    );
    process.stdout.write("\u8BF7\u626B\u63CF\u4E0A\u65B9\u4E8C\u7EF4\u7801\uFF1BCodex \u5B89\u88C5\u65F6\u5E94\u76F4\u63A5\u5C55\u793A PNG \u56FE\u7247\u3002\n\n");
    await params.onQr?.({ qrPath, qrContent });
  };
  let qr = await requestQr();
  await publishQr(qr.qrcode_img_content);
  const timeoutMs = params.timeoutMs ?? 8 * 6e4;
  const deadline = Date.now() + timeoutMs;
  let currentBaseUrl;
  let verifyCode;
  while (Date.now() < deadline) {
    let status;
    try {
      status = params.legacyGet ? await params.client.getQrStatusLegacy(
        qr.qrcode,
        currentBaseUrl,
        verifyCode
      ) : await params.client.getQrStatus(
        qr.qrcode,
        currentBaseUrl,
        verifyCode
      );
      verifyCode = void 0;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") continue;
      process.stderr.write(`\u4E8C\u7EF4\u7801\u72B6\u6001\u67E5\u8BE2\u5931\u8D25\uFF0C\u5C06\u91CD\u8BD5\uFF1A${String(error)}
`);
      continue;
    }
    switch (status.status) {
      case "wait":
        break;
      case "scaned":
        process.stdout.write("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u5FAE\u4FE1\u4E2D\u786E\u8BA4\u3002\n");
        break;
      case "need_verifycode": {
        const input = import_promises.default.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        try {
          verifyCode = (await input.question("\u5FAE\u4FE1\u8981\u6C42\u914D\u5BF9\u7801\uFF0C\u8BF7\u8F93\u5165\u624B\u673A\u4E0A\u663E\u793A\u7684\u6570\u5B57\uFF1A")).trim();
        } finally {
          input.close();
        }
        break;
      }
      case "scaned_but_redirect":
        if (status.redirect_host) {
          currentBaseUrl = status.redirect_host.startsWith("http") ? status.redirect_host : `https://${status.redirect_host}`;
          process.stdout.write(`\u767B\u5F55\u8BF7\u6C42\u5DF2\u5207\u6362\u5230\u5FAE\u4FE1\u7F51\u5173\uFF1A${currentBaseUrl}
`);
        }
        break;
      case "confirmed": {
        if (!status.bot_token || !status.ilink_bot_id) {
          throw new Error("\u5FAE\u4FE1\u786E\u8BA4\u6210\u529F\uFF0C\u4F46\u54CD\u5E94\u7F3A\u5C11 bot_token \u6216 ilink_bot_id");
        }
        const session = {
          accountId: normalizeAccountId2(status.ilink_bot_id),
          token: status.bot_token,
          userId: status.ilink_user_id,
          baseUrl: normalizeBaseUrl2(
            status.baseurl || currentBaseUrl || "https://ilinkai.weixin.qq.com"
          ),
          savedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        params.store.saveSession(session);
        const config = params.store.loadConfig();
        if (session.userId && config.security.allowedUserIds.length === 0) {
          config.security.allowedUserIds = [session.userId];
          params.store.saveConfig(config);
        }
        removeQrFile(qrPath);
        process.stdout.write("\u767B\u5F55\u6210\u529F\u3002\n");
        const credentialProtection = process.platform === "win32" ? "\u5F53\u524D\u7528\u6237\u914D\u7F6E\u76EE\u5F55" : "\u6743\u9650 0600";
        process.stdout.write(
          `\u51ED\u8BC1\u5DF2\u4FDD\u5B58\uFF1A${params.store.path("weixin-session.json")}\uFF08${credentialProtection}\uFF09
`
        );
        process.stdout.write(
          `\u540C\u6B65\u6E38\u6807\uFF1A${params.store.path("get-updates.json")}
`
        );
        process.stdout.write(
          `\u4F1A\u8BDD\u4E0A\u4E0B\u6587\uFF1A${params.store.path("context-tokens.json")}
`
        );
        return session;
      }
      case "binded_redirect":
        if (existing) {
          removeQrFile(qrPath);
          process.stdout.write("\u8BE5\u5FAE\u4FE1 Bot \u5DF2\u7ED1\u5B9A\uFF0C\u7EE7\u7EED\u4F7F\u7528\u672C\u5730\u5DF2\u6709\u51ED\u8BC1\u3002\n");
          return existing;
        }
        throw new Error("\u5FAE\u4FE1\u8FD4\u56DE\u5DF2\u7ED1\u5B9A\u72B6\u6001\uFF0C\u4F46\u672C\u5730\u6CA1\u6709\u53EF\u590D\u7528\u7684\u51ED\u8BC1");
      case "expired":
        process.stdout.write("\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u6B63\u5728\u81EA\u52A8\u5237\u65B0\u3002\n");
        qr = await requestQr();
        currentBaseUrl = void 0;
        verifyCode = void 0;
        await publishQr(qr.qrcode_img_content);
        break;
      case "verify_code_blocked":
        throw new Error("\u914D\u5BF9\u7801\u9A8C\u8BC1\u88AB\u6682\u65F6\u963B\u6B62\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u767B\u5F55");
    }
  }
  removeQrFile(qrPath);
  throw new Error("\u7B49\u5F85\u626B\u7801\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u8FD0\u884C\u767B\u5F55\u547D\u4EE4\u83B7\u53D6\u65B0\u4E8C\u7EF4\u7801");
}
function removeQrFile(qrPath) {
  try {
    import_node_fs6.default.rmSync(qrPath, { force: true });
  } catch {
  }
}
function normalizeAccountId2(value) {
  return value.trim().replaceAll("@", "-").replaceAll(".", "-").replace(/[^A-Za-z0-9_-]/g, "-");
}
function normalizeBaseUrl2(value) {
  const trimmed = value.trim();
  if (!trimmed) return "https://ilinkai.weixin.qq.com";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
}

// src/cli.ts
async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const store = new StateStore();
  store.ensure();
  ensureConfig(store);
  const config = store.loadConfig();
  switch (command) {
    case "login": {
      const client = new WeixinClient(config.weixin);
      const qrOutput = readQrOutput(args);
      await loginWithQr({
        client,
        store,
        legacyGet: args.includes("--legacy-get"),
        qrOutput
      });
      return;
    }
    case "daemon": {
      const client = new WeixinClient(config.weixin);
      const runner = new CodexTaskRunner(config.codex, store);
      const daemon = new CodelinkDaemon(config, store, client, runner);
      const shutdown = () => {
        void daemon.stop().finally(() => process.exit(0));
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      await daemon.start();
      return;
    }
    case "status": {
      printJson(await new DaemonClient().status());
      return;
    }
    case "doctor": {
      let daemonStatus = null;
      try {
        daemonStatus = await new DaemonClient().status();
      } catch {
      }
      printJson(createDoctorReport({ store, daemonStatus }));
      return;
    }
    case "tasks": {
      printJson(await new DaemonClient().recentTasks());
      return;
    }
    case "task": {
      const prompt = args.join(" ").trim();
      if (!prompt) throw new Error("\u7528\u6CD5\uFF1Acodelink task <\u4EFB\u52A1\u6587\u5B57>");
      const runner = new CodexTaskRunner(config.codex, store);
      printJson(
        await runner.runTask({
          messageId: `local-${(0, import_node_crypto4.randomUUID)()}`,
          fromUserId: "local-cli",
          prompt,
          startNew: true
        })
      );
      return;
    }
    case "send": {
      const text = args.join(" ").trim();
      if (!text) throw new Error("\u7528\u6CD5\uFF1Acodelink send <\u6D88\u606F\u6587\u5B57>");
      printJson(await new DaemonClient().send({ text }));
      return;
    }
    case "state": {
      printJson({
        stateDir: store.dir,
        config: store.path("config.json"),
        session: store.path("weixin-session.json"),
        syncCursor: store.path("get-updates.json"),
        contextTokens: store.path("context-tokens.json"),
        conversations: store.path("conversations.json"),
        tasks: store.path("tasks.json"),
        qr: store.path("login-qr.png")
      });
      return;
    }
    case "export-openclaw": {
      const outputPath = args[0]?.trim();
      const stateDir = args[1]?.trim();
      if (!outputPath) {
        throw new Error(
          "\u7528\u6CD5\uFF1Acodelink export-openclaw <\u8F93\u51FA\u6587\u4EF6> [OpenClaw state dir]"
        );
      }
      const bundle = exportOpenClawState({ outputPath, stateDir });
      printJson({
        ok: true,
        outputPath,
        accountId: bundle.account.accountId,
        userId: bundle.account.userId,
        tokenPresent: true,
        contextTokens: Object.keys(bundle.contextTokens ?? {}).length,
        routeTagPresent: Boolean(bundle.routeTag)
      });
      return;
    }
    case "import-openclaw": {
      const inputPath = args[0]?.trim();
      if (!inputPath) {
        throw new Error("\u7528\u6CD5\uFF1Acodelink import-openclaw <\u72B6\u6001\u5305\u6587\u4EF6>");
      }
      printJson(importOpenClawState({ inputPath, store }));
      process.stdout.write(
        "\u5BFC\u5165\u5B8C\u6210\u3002\u8BF7\u5B89\u5168\u5220\u9664\u4F20\u8F93\u4E2D\u7684\u72B6\u6001\u5305\uFF0C\u7136\u540E\u8FD0\u884C codelink daemon \u9A8C\u8BC1 token\u3002\n"
      );
      return;
    }
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(helpText());
      return;
    default:
      throw new Error(`\u672A\u77E5\u547D\u4EE4\uFF1A${command}

${helpText()}`);
  }
}
function ensureConfig(store) {
  const configPath = store.path("config.json");
  if (!import_node_fs7.default.existsSync(configPath)) store.saveConfig(store.loadConfig());
}
function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function helpText() {
  return `CodeLink 0.1.0

\u7528\u6CD5\uFF1A
  codelink login [--legacy-get] [--qr-output png|terminal|both]
                           \u663E\u793A\u5FAE\u4FE1\u4E8C\u7EF4\u7801\u5E76\u4FDD\u5B58\u767B\u5F55\u51ED\u8BC1
  codelink daemon         \u524D\u53F0\u8FD0\u884C\u5FAE\u4FE1\u76D1\u542C\u4E0E\u672C\u5730\u901A\u77E5 API
  codelink status         \u68C0\u67E5\u5B88\u62A4\u8FDB\u7A0B\u548C\u5FAE\u4FE1\u8FDE\u63A5
  codelink doctor         \u5B89\u5168\u68C0\u67E5\u5B89\u88C5\u3001\u63D2\u4EF6\u3001\u5FAE\u4FE1\u548C\u901A\u77E5\u5C31\u7EEA\u72B6\u6001
  codelink tasks          \u67E5\u770B\u6700\u8FD1\u7531\u5FAE\u4FE1\u53D1\u8D77\u6216\u7EED\u63A5\u7684 Codex \u8BB0\u5F55
  codelink task <\u6587\u5B57>    \u672C\u5730\u521B\u5EFA\u65B0\u7684 CodeLink Codex \u4F1A\u8BDD
  codelink send <\u6587\u5B57>    \u5411\u9ED8\u8BA4\u5FAE\u4FE1\u7528\u6237\u53D1\u9001\u901A\u77E5
  codelink state          \u663E\u793A\u672C\u5730\u72B6\u6001\u6587\u4EF6\u8DEF\u5F84\uFF08\u4E0D\u4F1A\u8F93\u51FA token\uFF09
  codelink export-openclaw <\u6587\u4EF6> [\u76EE\u5F55]  \u4ECE\u4E91\u7AEF OpenClaw \u5BFC\u51FA\u6700\u5C0F\u5FAE\u4FE1\u72B6\u6001\u5305
  codelink import-openclaw <\u6587\u4EF6>         \u5BFC\u5165\u4E91\u7AEF\u5FAE\u4FE1\u72B6\u6001\u5305
`;
}
function readQrOutput(args) {
  const index = args.indexOf("--qr-output");
  const value = index >= 0 ? args[index + 1] : process.env.CODELINK_QR_OUTPUT;
  if (value === void 0 || value === "") return "both";
  if (value === "png" || value === "terminal" || value === "both") {
    return value;
  }
  throw new Error("--qr-output \u5FC5\u987B\u662F png\u3001terminal \u6216 both");
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}
`
  );
  process.exitCode = 1;
});
