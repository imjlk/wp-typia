'use strict';

const path = require('node:path');
const Module = require('node:module');

const projectRequire = Module.createRequire(
  path.join(process.cwd(), 'package.json'),
);
const typescript6Entry = projectRequire.resolve('@typescript/typescript6');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveTypeScript6(
  request,
  parent,
  isMain,
  options,
) {
  if (request === 'typescript') {
    return typescript6Entry;
  }

  return originalResolveFilename.call(
    this,
    request,
    parent,
    isMain,
    options,
  );
};
