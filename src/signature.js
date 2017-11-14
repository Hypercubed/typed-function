import { Param } from './param';
import { contains, last } from './utils';

/**
     * A function signature
     * @param {string | string[] | Param[]} params
     *                         Array with the type(s) of each parameter,
     *                         or a comma separated string with types
     * @param {Function} fn    The actual function
     * @constructor
     */
export function Signature(params, fn) {
  var _params;
  if (typeof params === 'string') {
    _params = params !== '' ? params.split(',') : [];
  } else if (Array.isArray(params)) {
    _params = params;
  } else {
    throw new Error('string or Array expected');
  }

  this.params = new Array(_params.length);
  this.anyType = false;
  this.varArgs = false;
  for (var i = 0; i < _params.length; i++) {
    var param = new Param(_params[i]);
    this.params[i] = param;
    if (param.anyType) {
      this.anyType = true;
    }
    if (i === _params.length - 1) {
      // the last argument
      this.varArgs = param.varArgs;
    } else {
      // non-last argument
      if (param.varArgs) {
        throw new SyntaxError('Unexpected variable arguments operator "..."');
      }
    }
  }

  this.fn = fn;
}

/**
     * Create a clone of this signature
     * @returns {Signature} Returns a cloned version of this signature
     */
Signature.prototype.clone = function() {
  return new Signature(this.params.slice(), this.fn);
};

/**
     * Expand a signature: split params with union types in separate signatures
     * For example split a Signature "string | number" into two signatures.
     * @return {Signature[]} Returns an array with signatures (at least one)
     */
Signature.prototype.expand = function() {
  var signatures = [];
  var typed = this.typed;

  function recurse(signature, path) {
    if (path.length < signature.params.length) {
      var i, newParam, conversion;

      var param = signature.params[path.length];
      if (param.varArgs) {
        // a variable argument. do not split the types in the parameter
        newParam = param.clone();

        // add conversions to the parameter
        // recurse for all conversions
        for (i = 0; i < typed.conversions.length; i++) {
          conversion = typed.conversions[i];
          if (
            !contains(param.types, conversion.from) &&
            contains(param.types, conversion.to)
          ) {
            var j = newParam.types.length;
            newParam.types[j] = conversion.from;
            newParam.conversions[j] = conversion;
          }
        }

        recurse(signature, path.concat(newParam));
      } else {
        // split each type in the parameter
        for (i = 0; i < param.types.length; i++) {
          recurse(signature, path.concat(new Param(param.types[i])));
        }

        // recurse for all conversions
        for (i = 0; i < typed.conversions.length; i++) {
          conversion = typed.conversions[i];
          if (
            !contains(param.types, conversion.from) &&
            contains(param.types, conversion.to)
          ) {
            newParam = new Param(conversion.from);
            newParam.conversions[0] = conversion;
            recurse(signature, path.concat(newParam));
          }
        }
      }
    } else {
      signatures.push(new Signature(path, signature.fn));
    }
  }

  recurse(this, []);

  return signatures;
};

/**
     * Compare two signatures.
     *
     * When two params are equal and contain conversions, they will be sorted
     * by lowest index of the first conversions.
     *
     * @param {Signature} a
     * @param {Signature} b
     * @returns {number} Returns 1 if a > b, -1 if a < b, and else 0.
     */
Signature.compare = function(a, b, typed) {
  if (a.params.length > b.params.length) return 1;
  if (a.params.length < b.params.length) return -1;

  // count the number of conversions
  var i;
  var len = a.params.length; // a and b have equal amount of params
  var ac = 0;
  var bc = 0;
  for (i = 0; i < len; i++) {
    if (a.params[i].hasConversions()) ac++;
    if (b.params[i].hasConversions()) bc++;
  }

  if (ac > bc) return 1;
  if (ac < bc) return -1;

  // compare the order per parameter
  for (i = 0; i < a.params.length; i++) {
    var cmp = Param.compare(a.params[i], b.params[i], typed);
    if (cmp !== 0) {
      return cmp;
    }
  }

  return 0;
};

/**
     * Test whether any of the signatures parameters has conversions
     * @return {boolean} Returns true when any of the parameters contains
     *                   conversions.
     */
Signature.prototype.hasConversions = function() {
  for (var i = 0; i < this.params.length; i++) {
    if (this.params[i].hasConversions()) {
      return true;
    }
  }
  return false;
};

/**
     * Test whether this signature should be ignored.
     * Checks whether any of the parameters contains a type listed in
     * typed.ignore
     * @return {boolean} Returns true when the signature should be ignored
     */
Signature.prototype.ignore = function() {
  // create a map with ignored types
  var types = {};
  for (var i = 0; i < this.typed.ignore.length; i++) {
    types[this.typed.ignore[i]] = true;
  }

  // test whether any of the parameters contains this type
  for (i = 0; i < this.params.length; i++) {
    if (this.params[i].contains(types)) {
      return true;
    }
  }

  return false;
};

/**
     * Test whether the path of this signature matches a given path.
     * @param {Param[]} params
     */
Signature.prototype.paramsStartWith = function(params) {
  if (params.length === 0) {
    return true;
  }

  var aLast = last(this.params);
  var bLast = last(params);

  for (var i = 0; i < params.length; i++) {
    var a = this.params[i] || (aLast.varArgs ? aLast : null);
    var b = params[i] || (bLast.varArgs ? bLast : null);

    if (!a || !b || !a.matches(b)) {
      return false;
    }
  }

  return true;
};

/**
     * Generate the code to invoke this signature
     * @param {Refs} refs
     * @param {string} prefix
     * @returns {string} Returns code
     */
Signature.prototype.toCode = function(refs, prefix) {
  var code = [];

  var args = new Array(this.params.length);
  for (var i = 0; i < this.params.length; i++) {
    var param = this.params[i];
    var conversion = param.conversions[0];
    if (param.varArgs) {
      args[i] = 'varArgs';
    } else if (conversion) {
      args[i] = refs.add(conversion.convert, 'convert') + '(arg' + i + ')';
    } else {
      args[i] = 'arg' + i;
    }
  }

  var ref = this.fn ? refs.add(this.fn, 'signature') : undefined;
  if (ref) {
    return (
      prefix +
      'return ' +
      ref +
      '(' +
      args.join(', ') +
      '); // signature: ' +
      this.params.join(', ')
    );
  }

  return code.join('\n');
};

/**
     * Return a string representation of the signature
     * @returns {string}
     */
Signature.prototype.toString = function() {
  return this.params.join(', ');
};
