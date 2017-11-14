import { getTypeTest } from './utils';
  
  /**
     * A group of signatures with the same parameter on given index
     * @param {Param[]} path
     * @param {Signature} [signature]
     * @param {Node[]} childs
     * @param {boolean} [fallThrough=false]
     * @constructor
     */
export function Node(path, signature, childs, fallThrough) {
  this.path = path || [];
  this.param = path[path.length - 1] || null;
  this.signature = signature || null;
  this.childs = childs || [];
  this.fallThrough = fallThrough || false;
}

/**
     * Generate code for this group of signatures
     * @param {Refs} refs
     * @param {string} prefix
     * @returns {string} Returns the code as string
     */
Node.prototype.toCode = function(refs, prefix) {
  var typed = this.typed;

  // TODO: split this function in multiple functions, it's too large
  var code = [];

  if (this.param) {
    var index = this.path.length - 1;
    var conversion = this.param.conversions[0];
    var comment =
      '// type: ' +
      (conversion
        ? conversion.from + ' (convert to ' + conversion.to + ')'
        : this.param);

    // non-root node (path is non-empty)
    if (this.param.varArgs) {
      if (this.param.anyType) {
        // variable arguments with any type
        code.push(prefix + 'if (arguments.length > ' + index + ') {');
        code.push(prefix + '  var varArgs = [];');
        code.push(
          prefix + '  for (var i = ' + index + '; i < arguments.length; i++) {'
        );
        code.push(prefix + '    varArgs.push(arguments[i]);');
        code.push(prefix + '  }');
        code.push(this.signature.toCode(refs, prefix + '  '));
        code.push(prefix + '}');
      } else {
        // variable arguments with a fixed type
        var getTests = function(types, arg) {
          var tests = [];
          for (var i = 0; i < types.length; i++) {
            tests[i] =
              refs.add(getTypeTest(types[i], typed), 'test') + '(' + arg + ')';
          }
          return tests.join(' || ');
        }.bind(this);

        var allTypes = this.param.types;
        var exactTypes = [];
        for (var i = 0; i < allTypes.length; i++) {
          if (this.param.conversions[i] === undefined) {
            exactTypes.push(allTypes[i]);
          }
        }

        code.push(
          prefix + 'if (' + getTests(allTypes, 'arg' + index) + ') { ' + comment
        );
        code.push(prefix + '  var varArgs = [arg' + index + '];');
        code.push(
          prefix +
            '  for (var i = ' +
            (index + 1) +
            '; i < arguments.length; i++) {'
        );
        code.push(
          prefix + '    if (' + getTests(exactTypes, 'arguments[i]') + ') {'
        );
        code.push(prefix + '      varArgs.push(arguments[i]);');

        for (var i = 0; i < allTypes.length; i++) {
          var conversion_i = this.param.conversions[i];
          if (conversion_i) {
            var test = refs.add(getTypeTest(allTypes[i], typed), 'test');
            var convert = refs.add(conversion_i.convert, 'convert');
            code.push(prefix + '    }');
            code.push(prefix + '    else if (' + test + '(arguments[i])) {');
            code.push(
              prefix + '      varArgs.push(' + convert + '(arguments[i]));'
            );
          }
        }
        code.push(prefix + '    } else {');
        code.push(
          prefix +
            "      throw createError(name, arguments.length, i, arguments[i], '" +
            exactTypes.join(',') +
            "');"
        );
        code.push(prefix + '    }');
        code.push(prefix + '  }');
        code.push(this.signature.toCode(refs, prefix + '  '));
        code.push(prefix + '}');
      }
    } else {
      if (this.param.anyType) {
        // any type
        code.push(prefix + '// type: any');
        code.push(this._innerCode(refs, prefix));
      } else {
        // regular type
        var type = this.param.types[0];
        var test = type !== 'any' ? refs.add(getTypeTest(type, typed), 'test') : null;

        code.push(prefix + 'if (' + test + '(arg' + index + ')) { ' + comment);
        code.push(this._innerCode(refs, prefix + '  '));
        code.push(prefix + '}');
      }
    }
  } else {
    // root node (path is empty)
    code.push(this._innerCode(refs, prefix));
  }

  return code.join('\n');
};

/**
     * Generate inner code for this group of signatures.
     * This is a helper function of Node.prototype.toCode
     * @param {Refs} refs
     * @param {string} prefix
     * @returns {string} Returns the inner code as string
     * @private
     */
Node.prototype._innerCode = function(refs, prefix) {
  var code = [];
  var i;

  if (this.signature) {
    code.push(prefix + 'if (arguments.length === ' + this.path.length + ') {');
    code.push(this.signature.toCode(refs, prefix + '  '));
    code.push(prefix + '}');
  }

  for (i = 0; i < this.childs.length; i++) {
    code.push(this.childs[i].toCode(refs, prefix));
  }

  // TODO: shouldn't the this.param.anyType check be redundant
  if (!this.fallThrough || (this.param && this.param.anyType)) {
    var exceptions = this._exceptions(refs, prefix);
    if (exceptions) {
      code.push(exceptions);
    }
  }

  return code.join('\n');
};

/**
     * Generate code to throw exceptions
     * @param {Refs} refs
     * @param {string} prefix
     * @returns {string} Returns the inner code as string
     * @private
     */
Node.prototype._exceptions = function(refs, prefix) {
  var index = this.path.length;

  if (this.childs.length === 0) {
    // TODO: can this condition be simplified? (we have a fall-through here)
    return [
      prefix + 'if (arguments.length > ' + index + ') {',
      prefix +
        '  throw createError(name, arguments.length, ' +
        index +
        ', arguments[' +
        index +
        ']);',
      prefix + '}'
    ].join('\n');
  } else {
    var keys = {};
    var types = [];

    for (var i = 0; i < this.childs.length; i++) {
      var node = this.childs[i];
      if (node.param) {
        for (var j = 0; j < node.param.types.length; j++) {
          var type = node.param.types[j];
          if (!(type in keys) && !node.param.conversions[j]) {
            keys[type] = true;
            types.push(type);
          }
        }
      }
    }

    return (
      prefix +
      'throw createError(name, arguments.length, ' +
      index +
      ', arguments[' +
      index +
      "], '" +
      types.join(',') +
      "');"
    );
  }
};
