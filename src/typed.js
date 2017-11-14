import { Refs } from './refs';
import { Param } from './param';
import { Signature } from './signature';
import { Node } from './node';
import { contains } from './utils';

// factory function to create a new instance of typed-function
// TODO: allow passing configuration, types, tests via the factory function
function create() {

  /**
     * Retrieve the function name from a set of functions, and check
     * whether the name of all functions match (if given)
     * @param {Array.<function>} fns
     */
  function getName(fns) {
    var name = '';

    for (var i = 0; i < fns.length; i++) {
      var fn = fns[i];

      // merge function name when this is a typed function
      if (fn.signatures && fn.name != '') {
        if (name == '') {
          name = fn.name;
        } else if (name != fn.name) {
          var err = new Error(
            'Function names do not match (expected: ' +
              name +
              ', actual: ' +
              fn.name +
              ')'
          );
          err.data = {
            actual: fn.name,
            expected: name
          };
          throw err;
        }
      }
    }

    return name;
  }

  /**
     * Create an ArgumentsError. Creates messages like:
     *
     *   Unexpected type of argument (expected: ..., actual: ..., index: ...)
     *   Too few arguments (expected: ..., index: ...)
     *   Too many arguments (expected: ..., actual: ...)
     *
     * @param {String} fn         Function name
     * @param {number} argCount   Number of arguments
     * @param {Number} index      Current argument index
     * @param {*} actual          Current argument
     * @param {string} [expected] An optional, comma separated string with
     *                            expected types on given index
     * @extends Error
     */
  function createError(fn, argCount, index, actual, expected) {
    var actualType = getTypeOf(actual);
    var _expected = expected ? expected.split(',') : null;
    var _fn = fn || 'unnamed';
    var anyType = _expected && contains(_expected, 'any');
    var message;
    var data = {
      fn: fn,
      index: index,
      actual: actual,
      expected: _expected
    };

    if (_expected) {
      if (argCount > index && !anyType) {
        // unexpected type
        message =
          'Unexpected type of argument in function ' +
          _fn +
          ' (expected: ' +
          _expected.join(' or ') +
          ', actual: ' +
          actualType +
          ', index: ' +
          index +
          ')';
      } else {
        // too few arguments
        message =
          'Too few arguments in function ' +
          _fn +
          ' (expected: ' +
          _expected.join(' or ') +
          ', index: ' +
          index +
          ')';
      }
    } else {
      // too many arguments
      message =
        'Too many arguments in function ' +
        _fn +
        ' (expected: ' +
        index +
        ', actual: ' +
        argCount +
        ')';
    }

    var err = new TypeError(message);
    err.data = data;
    return err;
  }

  /**
     * Split all raw signatures into an array with expanded Signatures
     * @param {Object.<string, Function>} rawSignatures
     * @return {Signature[]} Returns an array with expanded signatures
     */
  function parseSignatures(rawSignatures) {
    // FIXME: need to have deterministic ordering of signatures, do not create via object
    var signature;
    var keys = {};
    var signatures = [];
    var i;

    for (var types in rawSignatures) {
      if (rawSignatures.hasOwnProperty(types)) {
        var fn = rawSignatures[types];
        signature = new Signature(types, fn);
        signature.typed = typed;

        if (signature.ignore()) {
          continue;
        }

        var expanded = signature.expand();

        for (i = 0; i < expanded.length; i++) {
          var signature_i = expanded[i];
          var key = signature_i.toString();
          var existing = keys[key];
          if (!existing) {
            keys[key] = signature_i;
          } else {
            var cmp = Signature.compare(signature_i, existing, typed);
            if (cmp < 0) {
              // override if sorted first
              keys[key] = signature_i;
            } else if (cmp === 0) {
              throw new Error('Signature "' + key + '" is defined twice');
            }
            // else: just ignore
          }
        }
      }
    }

    // convert from map to array
    for (key in keys) {
      if (keys.hasOwnProperty(key)) {
        signatures.push(keys[key]);
      }
    }

    // order the signatures
    signatures.sort(function(a, b) {
      return Signature.compare(a, b, typed);
    });

    // filter redundant conversions from signatures with varArgs
    // TODO: simplify this loop or move it to a separate function
    for (i = 0; i < signatures.length; i++) {
      signature = signatures[i];

      if (signature.varArgs) {
        var index = signature.params.length - 1;
        var param = signature.params[index];

        var t = 0;
        while (t < param.types.length) {
          if (param.conversions[t]) {
            var type = param.types[t];

            for (var j = 0; j < signatures.length; j++) {
              var other = signatures[j];
              var p = other.params[index];

              if (
                other !== signature &&
                p &&
                contains(p.types, type) &&
                !p.conversions[index]
              ) {
                // this (conversion) type already exists, remove it
                param.types.splice(t, 1);
                param.conversions.splice(t, 1);
                t--;
                break;
              }
            }
          }
          t++;
        }
      }
    }

    return signatures;
  }

  /**
     * Filter all any type signatures
     * @param {Signature[]} signatures
     * @return {Signature[]} Returns only any type signatures
     */
  function filterAnyTypeSignatures(signatures) {
    var filtered = [];

    for (var i = 0; i < signatures.length; i++) {
      if (signatures[i].anyType) {
        filtered.push(signatures[i]);
      }
    }

    return filtered;
  }

  /**
     * create a map with normalized signatures as key and the function as value
     * @param {Signature[]} signatures   An array with split signatures
     * @return {Object.<string, Function>} Returns a map with normalized
     *                                     signatures as key, and the function
     *                                     as value.
     */
  function mapSignatures(signatures) {
    var normalized = {};

    for (var i = 0; i < signatures.length; i++) {
      var signature = signatures[i];
      if (signature.fn && !signature.hasConversions()) {
        var params = signature.params.join(',');
        normalized[params] = signature.fn;
      }
    }

    return normalized;
  }

  /**
     * Parse signatures recursively in a node tree.
     * @param {Signature[]} signatures  Array with expanded signatures
     * @param {Param[]} path            Traversed path of parameter types
     * @param {Signature[]} anys
     * @return {Node}                   Returns a node tree
     */
  function parseTree(signatures, path, anys) {
    var i, signature;
    var index = path.length;
    var nodeSignature;

    var filtered = [];
    for (i = 0; i < signatures.length; i++) {
      signature = signatures[i];

      // filter the first signature with the correct number of params
      if (signature.params.length === index && !nodeSignature) {
        nodeSignature = signature;
      }

      if (signature.params[index] != undefined) {
        filtered.push(signature);
      }
    }

    // sort the filtered signatures by param
    filtered.sort(function(a, b) {
      return Param.compare(a.params[index], b.params[index], typed);
    });

    // recurse over the signatures
    var entries = [];
    for (i = 0; i < filtered.length; i++) {
      signature = filtered[i];
      // group signatures with the same param at current index
      var param = signature.params[index];

      // TODO: replace the next filter loop
      var existing = entries.filter(function(entry) {
        return entry.param.overlapping(param);
      })[0];

      //var existing;
      //for (var j = 0; j < entries.length; j++) {
      //  if (entries[j].param.overlapping(param)) {
      //    existing = entries[j];
      //    break;
      //  }
      //}

      if (existing) {
        if (existing.param.varArgs) {
          throw new Error(
            'Conflicting types "' + existing.param + '" and "' + param + '"'
          );
        }
        existing.signatures.push(signature);
      } else {
        entries.push({
          param: param,
          signatures: [signature]
        });
      }
    }

    // find all any type signature that can still match our current path
    var matchingAnys = [];
    for (i = 0; i < anys.length; i++) {
      if (anys[i].paramsStartWith(path)) {
        matchingAnys.push(anys[i]);
      }
    }

    // see if there are any type signatures that don't match any of the
    // signatures that we have in our tree, i.e. we have alternative
    // matching signature(s) outside of our current tree and we should
    // fall through to them instead of throwing an exception
    var fallThrough = false;
    for (i = 0; i < matchingAnys.length; i++) {
      if (!contains(signatures, matchingAnys[i])) {
        fallThrough = true;
        break;
      }
    }

    // parse the childs
    var childs = new Array(entries.length);
    for (i = 0; i < entries.length; i++) {
      var entry = entries[i];
      childs[i] = parseTree(
        entry.signatures,
        path.concat(entry.param),
        matchingAnys
      );
    }

    const node = new Node(path, nodeSignature, childs, fallThrough);
    node.typed = typed;

    return node;
  }

  /**
     * Generate an array like ['arg0', 'arg1', 'arg2']
     * @param {number} count Number of arguments to generate
     * @returns {Array} Returns an array with argument names
     */
  function getArgs(count) {
    // create an array with all argument names
    var args = [];
    for (var i = 0; i < count; i++) {
      args[i] = 'arg' + i;
    }

    return args;
  }

  /**
     * Compose a function from sub-functions each handling a single type signature.
     * Signatures:
     *   typed(signature: string, fn: function)
     *   typed(name: string, signature: string, fn: function)
     *   typed(signatures: Object.<string, function>)
     *   typed(name: string, signatures: Object.<string, function>)
     *
     * @param {string | null} name
     * @param {Object.<string, Function>} signatures
     * @return {Function} Returns the typed function
     * @private
     */
  function _typed(name, signatures) {
    var refs = new Refs();

    // parse signatures, expand them
    var _signatures = parseSignatures(signatures);
    if (_signatures.length == 0) {
      throw new Error('No signatures provided');
    }

    // filter all any type signatures
    var anys = filterAnyTypeSignatures(_signatures);

    // parse signatures into a node tree
    var node = parseTree(_signatures, [], anys);

    //var util = require('util');
    //console.log('ROOT');
    //console.log(util.inspect(node, { depth: null }));

    // generate code for the typed function
    var code = [];
    var _name = name || '';
    var _args = getArgs(maxParams(_signatures));
    code.push('function ' + _name + '(' + _args.join(', ') + ') {');
    code.push('  "use strict";');
    code.push("  var name = '" + _name + "';");
    code.push(node.toCode(refs, '  ', false));
    code.push('}');

    // generate body for the factory function
    var body = [refs.toCode(), 'return ' + code.join('\n')].join('\n');

    // evaluate the JavaScript code and attach function references
    var factory = new Function(refs.name, 'createError', body);
    var fn = factory(refs, createError);

    //console.log('FN\n' + fn.toString()); // TODO: cleanup

    // attach the signatures with sub-functions to the constructed function
    fn.signatures = mapSignatures(_signatures);

    return fn;
  }

  /**
     * Calculate the maximum number of parameters in givens signatures
     * @param {Signature[]} signatures
     * @returns {number} The maximum number of parameters
     */
  function maxParams(signatures) {
    var max = 0;

    for (var i = 0; i < signatures.length; i++) {
      var len = signatures[i].params.length;
      if (len > max) {
        max = len;
      }
    }

    return max;
  }

  /**
     * Get the type of a value
     * @param {*} x
     * @returns {string} Returns a string with the type of value
     */
  function getTypeOf(x) {
    var obj;

    for (var i = 0; i < typed.types.length; i++) {
      var entry = typed.types[i];

      if (entry.name === 'Object') {
        // Array and Date are also Object, so test for Object afterwards
        obj = entry;
      } else {
        if (entry.test(x)) return entry.name;
      }
    }

    // at last, test whether an object
    if (obj && obj.test(x)) return obj.name;

    return 'unknown';
  }

  // data type tests
  var types = [
    {
      name: 'number',
      test: function(x) {
        return typeof x === 'number';
      }
    },
    {
      name: 'string',
      test: function(x) {
        return typeof x === 'string';
      }
    },
    {
      name: 'boolean',
      test: function(x) {
        return typeof x === 'boolean';
      }
    },
    {
      name: 'Function',
      test: function(x) {
        return typeof x === 'function';
      }
    },
    { name: 'Array', test: Array.isArray },
    {
      name: 'Date',
      test: function(x) {
        return x instanceof Date;
      }
    },
    {
      name: 'RegExp',
      test: function(x) {
        return x instanceof RegExp;
      }
    },
    {
      name: 'Object',
      test: function(x) {
        return typeof x === 'object';
      }
    },
    {
      name: 'null',
      test: function(x) {
        return x === null;
      }
    },
    {
      name: 'undefined',
      test: function(x) {
        return x === undefined;
      }
    }
  ];

  // configuration
  var config = {};

  // type conversions. Order is important
  var conversions = [];

  // types to be ignored
  var ignore = [];

  // temporary object for holding types and conversions, for constructing
  // the `typed` function itself
  // TODO: find a more elegant solution for this
  var typed = {
    config: config,
    types: types,
    conversions: conversions,
    ignore: ignore
  };

  /**
     * Construct the typed function itself with various signatures
     *
     * Signatures:
     *
     *   typed(signatures: Object.<string, function>)
     *   typed(name: string, signatures: Object.<string, function>)
     */
  typed = _typed('typed', {
    Object: function(signatures) {
      var fns = [];
      for (var signature in signatures) {
        if (signatures.hasOwnProperty(signature)) {
          fns.push(signatures[signature]);
        }
      }
      var name = getName(fns);

      return _typed(name, signatures);
    },
    'string, Object': _typed,
    // TODO: add a signature 'Array.<function>'
    '...Function': function(fns) {
      var err;
      var name = getName(fns);
      var signatures = {};

      for (var i = 0; i < fns.length; i++) {
        var fn = fns[i];

        // test whether this is a typed-function
        if (!(typeof fn.signatures === 'object')) {
          err = new TypeError(
            'Function is no typed-function (index: ' + i + ')'
          );
          err.data = { index: i };
          throw err;
        }

        // merge the signatures
        for (var signature in fn.signatures) {
          if (fn.signatures.hasOwnProperty(signature)) {
            if (signatures.hasOwnProperty(signature)) {
              if (fn.signatures[signature] !== signatures[signature]) {
                err = new Error(
                  'Signature "' + signature + '" is defined twice'
                );
                err.data = { signature: signature };
                throw err;
              }
              // else: both signatures point to the same function, that's fine
            } else {
              signatures[signature] = fn.signatures[signature];
            }
          }
        }
      }

      return _typed(name, signatures);
    }
  });

  /**
     * Find a specific signature from a (composed) typed function, for
     * example:
     *
     *   typed.find(fn, ['number', 'string'])
     *   typed.find(fn, 'number, string')
     *
     * Function find only only works for exact matches.
     *
     * @param {Function} fn                   A typed-function
     * @param {string | string[]} signature   Signature to be found, can be
     *                                        an array or a comma separated string.
     * @return {Function}                     Returns the matching signature, or
     *                                        throws an errror when no signature
     *                                        is found.
     */
  function find(fn, signature) {
    if (!fn.signatures) {
      throw new TypeError('Function is no typed-function');
    }

    // normalize input
    var arr;
    if (typeof signature === 'string') {
      arr = signature.split(',');
      for (var i = 0; i < arr.length; i++) {
        arr[i] = arr[i].trim();
      }
    } else if (Array.isArray(signature)) {
      arr = signature;
    } else {
      throw new TypeError('String array or a comma separated string expected');
    }

    var str = arr.join(',');

    // find an exact match
    var match = fn.signatures[str];
    if (match) {
      return match;
    }

    // TODO: extend find to match non-exact signatures

    throw new TypeError(
      'Signature not found (signature: ' +
        (fn.name || 'unnamed') +
        '(' +
        arr.join(', ') +
        '))'
    );
  }

  /**
     * Convert a given value to another data type.
     * @param {*} value
     * @param {string} type
     */
  function convert(value, type) {
    var from = getTypeOf(value);

    // check conversion is needed
    if (type === from) {
      return value;
    }

    for (var i = 0; i < typed.conversions.length; i++) {
      var conversion = typed.conversions[i];
      if (conversion.from === from && conversion.to === type) {
        return conversion.convert(value);
      }
    }

    throw new Error('Cannot convert from ' + from + ' to ' + type);
  }

  // attach types and conversions to the final `typed` function
  typed.config = config;
  typed.types = types;
  typed.conversions = conversions;
  typed.ignore = ignore;
  typed.create = create;
  typed.find = find;
  typed.convert = convert;

  // add a type
  typed.addType = function(type) {
    if (
      !type ||
      typeof type.name !== 'string' ||
      typeof type.test !== 'function'
    ) {
      throw new TypeError(
        'Object with properties {name: string, test: function} expected'
      );
    }

    typed.types.push(type);
  };

  // add a conversion
  typed.addConversion = function(conversion) {
    if (
      !conversion ||
      typeof conversion.from !== 'string' ||
      typeof conversion.to !== 'string' ||
      typeof conversion.convert !== 'function'
    ) {
      throw new TypeError(
        'Object with properties {from: string, to: string, convert: function} expected'
      );
    }

    typed.conversions.push(conversion);
  };

  return typed;
}

export const typed = create();

