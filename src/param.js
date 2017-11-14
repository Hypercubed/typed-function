import { contains } from './utils';

/**
     * A function parameter
     * @param {string | string[] | Param} types    A parameter type like 'string',
     *                                             'number | boolean'
     * @param {boolean} [varArgs=false]            Variable arguments if true
     * @constructor
     */
export function Param(types, varArgs) {
  // parse the types, can be a string with types separated by pipe characters |
  if (typeof types === 'string') {
    // parse variable arguments operator (ellipses '...number')
    var _types = types.trim();
    var _varArgs = _types.substr(0, 3) === '...';
    if (_varArgs) {
      _types = _types.substr(3);
    }
    if (_types === '') {
      this.types = ['any'];
    } else {
      this.types = _types.split('|');
      for (var i = 0; i < this.types.length; i++) {
        this.types[i] = this.types[i].trim();
      }
    }
  } else if (Array.isArray(types)) {
    this.types = types;
  } else if (types instanceof Param) {
    return types.clone();
  } else {
    throw new Error('String or Array expected');
  }

  // can hold a type to which to convert when handling this parameter
  this.conversions = [];
  // TODO: implement better API for conversions, be able to add conversions via constructor (support a new type Object?)

  // variable arguments
  this.varArgs = _varArgs || varArgs || false;

  // check for any type arguments
  this.anyType = this.types.indexOf('any') !== -1;
}

/**
       * Order Params
       * any type ('any') will be ordered last, and object as second last (as other
       * types may be an object as well, like Array).
       *
       * @param {Param} a
       * @param {Param} b
       * @returns {number} Returns 1 if a > b, -1 if a < b, and else 0.
       */
Param.compare = function(a, b, typed) {
  // TODO: simplify parameter comparison, it's a mess
  if (a.anyType) return 1;
  if (b.anyType) return -1;

  if (contains(a.types, 'Object')) return 1;
  if (contains(b.types, 'Object')) return -1;

  if (a.hasConversions()) {
    if (b.hasConversions()) {
      var i, ac, bc;

      for (i = 0; i < a.conversions.length; i++) {
        if (a.conversions[i] !== undefined) {
          ac = a.conversions[i];
          break;
        }
      }

      for (i = 0; i < b.conversions.length; i++) {
        if (b.conversions[i] !== undefined) {
          bc = b.conversions[i];
          break;
        }
      }

      return typed.conversions.indexOf(ac) - typed.conversions.indexOf(bc);
    } else {
      return 1;
    }
  } else {
    if (b.hasConversions()) {
      return -1;
    } else {
      // both params have no conversions
      var ai, bi;

      for (i = 0; i < typed.types.length; i++) {
        if (typed.types[i].name === a.types[0]) {
          ai = i;
          break;
        }
      }

      for (i = 0; i < typed.types.length; i++) {
        if (typed.types[i].name === b.types[0]) {
          bi = i;
          break;
        }
      }

      return ai - bi;
    }
  }
};

/**
       * Test whether this parameters types overlap an other parameters types.
       * Will not match ['any'] with ['number']
       * @param {Param} other
       * @return {boolean} Returns true when there are overlapping types
       */
Param.prototype.overlapping = function(other) {
  for (var i = 0; i < this.types.length; i++) {
    if (contains(other.types, this.types[i])) {
      return true;
    }
  }
  return false;
};

/**
       * Test whether this parameters types matches an other parameters types.
       * When any of the two parameters contains `any`, true is returned
       * @param {Param} other
       * @return {boolean} Returns true when there are matching types
       */
Param.prototype.matches = function(other) {
  return this.anyType || other.anyType || this.overlapping(other);
};

/**
       * Create a clone of this param
       * @returns {Param} Returns a cloned version of this param
       */
Param.prototype.clone = function() {
  var param = new Param(this.types.slice(), this.varArgs);
  param.conversions = this.conversions.slice();
  return param;
};

/**
       * Test whether this parameter contains conversions
       * @returns {boolean} Returns true if the parameter contains one or
       *                    multiple conversions.
       */
Param.prototype.hasConversions = function() {
  return this.conversions.length > 0;
};

/**
       * Tests whether this parameters contains any of the provided types
       * @param {Object} types  A Map with types, like {'number': true}
       * @returns {boolean}     Returns true when the parameter contains any
       *                        of the provided types
       */
Param.prototype.contains = function(types) {
  for (var i = 0; i < this.types.length; i++) {
    if (types[this.types[i]]) {
      return true;
    }
  }
  return false;
};

/**
       * Return a string representation of this params types, like 'string' or
       * 'number | boolean' or '...number'
       * @param {boolean} [toConversion]   If true, the returned types string
       *                                   contains the types where the parameter
       *                                   will convert to. If false (default)
       *                                   the "from" types are returned
       * @returns {string}
       */
Param.prototype.toString = function(toConversion) {
  var types = [];
  var keys = {};

  for (var i = 0; i < this.types.length; i++) {
    var conversion = this.conversions[i];
    var type = toConversion && conversion ? conversion.to : this.types[i];
    if (!(type in keys)) {
      keys[type] = true;
      types.push(type);
    }
  }

  return (this.varArgs ? '...' : '') + types.join('|');
};
