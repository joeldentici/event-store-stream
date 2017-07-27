const λ = require('fantasy-check/src/adapters/nodeunit');

const {eq, createManager} = require('../test-lib.js');
const {identity, constant} = require('fantasy-combinators');

const client = require('../src');
const {Async, Maybe, ConcurrentFree: F} = require('monadic-js');

