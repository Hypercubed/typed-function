/**
 * Collection with function references (local shortcuts to functions)
 * @constructor
 * @param {string} [name='refs']  Optional name for the refs, used to generate
 *                                JavaScript code
 */
export function Refs(name) {
  this.name = name || 'refs';
  this.categories = {};
}

/**
   * Add a function reference.
   * @param {Function} fn
   * @param {string} [category='fn']    A function category, like 'fn' or 'signature'
   * @returns {string} Returns the function name, for example 'fn0' or 'signature2'
   */
Refs.prototype.add = function(fn, category) {
  var cat = category || 'fn';
  if (!this.categories[cat]) this.categories[cat] = [];

  var index = this.categories[cat].indexOf(fn);
  if (index == -1) {
    index = this.categories[cat].length;
    this.categories[cat].push(fn);
  }

  return cat + index;
};

/**
   * Create code lines for all function references
   * @returns {string} Returns the code containing all function references
   */
Refs.prototype.toCode = function() {
  var code = [];
  var path = this.name + '.categories';
  var categories = this.categories;

  for (var cat in categories) {
    if (categories.hasOwnProperty(cat)) {
      var category = categories[cat];

      for (var i = 0; i < category.length; i++) {
        code.push(
          'var ' + cat + i + ' = ' + path + "['" + cat + "'][" + i + '];'
        );
      }
    }
  }

  return code.join('\n');
};
