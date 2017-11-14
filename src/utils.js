/**
     * Test whether an array contains some item
     * @param {Array} array
     * @param {*} item
     * @return {boolean} Returns true if array contains item, false if not.
     */
export function contains(array, item) {
  return array.indexOf(item) !== -1;
}

/**
     * Get a type test function for a specific data type
     * @param {string} name                   Name of a data type like 'number' or 'string'
     * @returns {Function(obj: *) : boolean}  Returns a type testing function.
     *                                        Throws an error for an unknown type.
     */
export function getTypeTest(name, typed) {
  var test;
  for (var i = 0; i < typed.types.length; i++) {
    var entry = typed.types[i];
    if (entry.name === name) {
      test = entry.test;
      break;
    }
  }

  if (!test) {
    var hint;
    for (i = 0; i < typed.types.length; i++) {
      entry = typed.types[i];
      if (entry.name.toLowerCase() == name.toLowerCase()) {
        hint = entry.name;
        break;
      }
    }

    throw new Error(
      'Unknown type "' +
        name +
        '"' +
        (hint ? '. Did you mean "' + hint + '"?' : '')
    );
  }
  return test;
}

  /**
     * Returns the last item in the array
     * @param {Array} array
     * @return {*} item
     */
    export function last(array) {
      return array[array.length - 1];
    }