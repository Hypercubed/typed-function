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
     * Returns the last item in the array
     * @param {Array} array
     * @return {*} item
     */
export function last(array) {
  return array[array.length - 1];
}
