// temporary fix until this PR is accepted
// https://github.com/couchbase/couchnode/pull/27

/* jshint ignore:start */

var couchbase = require('couchbase');

// http://docs.couchdb.org/en/latest/couchapp/views/collation.html
var SORT_ORDER = function() {
  var ordered_array = [
    'null',
    'false',
    'true',
    'number',
    'string',
    'array',
    'object',
    'unknown'
  ];

  var obj = {};
  for (var i = 0; i < ordered_array.length; i++) {
    obj[ordered_array[i]] = i;
  }
  return obj;
}();

/**
 * Returns the sorting priority for a given type
 * @param v The value whose type should be evaluated
 * @return The numeric sorting index
 */
function getSortIndex(v) {
  if (typeof v === 'string') {
    return SORT_ORDER['string'];
  } else if (typeof v === 'number') {
    return SORT_ORDER['number'];
  } else if (Array.isArray(v)) {
    return SORT_ORDER['array'];
  } else if (v === true) {
    return SORT_ORDER['true'];
  } else if (v === false) {
    return SORT_ORDER['false'];
  } else if (v === null) {
    return SORT_ORDER['null'];
  } else if (typeof v === 'object') {
    return SORT_ORDER['object'];
  } else {
    return SORT_ORDER['unknown'];
  }
}

/**
 * Compares one value with another
 * @param a The first value
 * @param b The second value
 * @param [exact] If both @c b and @c b are arrays, setting this parameter to true
 * ensures that they will only be equal if their length matches and their
 * contents match. If this value is false (the default), then only the common
 * subset of elements are evaluated
 *
 * @return {number} greater than 0 if @c a is bigger than @b; a number less
 * than 0 if @a is less than @b, or 0 if they are equal
 */
function cbCompare(a, b, exact) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (exact === true) {
      if (a.length !== b.length) {
        return a.length > b.length ? +1 : -1;
      }
    }
    var maxLength = a.length > b.length ? b.length : a.length;
    for (var i = 0; i < maxLength; ++i) {
      var subCmp = cbCompare(a[i], b[i], true);
      if (subCmp !== 0) {
        return subCmp;
      }
    }
    return 0;
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  // Now we need to do special things
  var aPriority = getSortIndex(a);
  var bPriority = getSortIndex(b);
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  } else {
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  }
}

/**
 * Find the index of @c val in the array @arr
 * @param arr The array to search in
 * @param val The value to search for
 * @return {number} the index in the array, or -1 if the item does not exist
 */
function cbIndexOf(arr, val) {
  for (var i = 0; i < arr.length; ++i) {
    if (cbCompare(arr[i], val, true) === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Normalize a key for reduce
 * @param key The key to normalize
 * @param groupLevel The group level
 * @return {*}
 */
function cbNormKey(key, groupLevel) {
  if (groupLevel === 0) {
    return null;
  }

  if (Array.isArray(key)) {
    if (groupLevel === -1) {
      return key;
    } else {
      return key.slice(0, groupLevel);
    }
  } else {
    return key;
  }
}

function MockBucket_execView(ddoc, name, options, callback) {
  this._indexView(ddoc, name, options, function(err, results, reducer) {
    if (err) {
      return callback(err);
    }

    // Store total emitted rows
    var rowcount = results.length;

    // Parse if needed
    var startkey = options.startkey ? JSON.parse(options.startkey) : undefined;
    var startkey_docid = options.startkey_docid;
    var endkey = options.endkey ? JSON.parse(options.endkey) : undefined;
    var endkey_docid = options.endkey_docid;
    var group_level = options.group ? -1 : options.group_level || 0;

    var inclusive_start = true;
    var inclusive_end = (options.inclusive_end !== 'false');

    // Invert if descending
    if (options.descending) {
      var _startkey = startkey;
      startkey = endkey;
      endkey = _startkey;
      var _startkey_docid = startkey_docid;
      startkey_docid = endkey_docid;
      endkey_docid = _startkey_docid;
      var _inclusive_start = inclusive_start;
      inclusive_start = inclusive_end;
      inclusive_end = _inclusive_start;
    }

    var key = options.key ? JSON.parse(options.key) : undefined;
    var keys = options.keys ? JSON.parse(options.keys) : undefined;

    var newResults = [];
    for (var i = 0; i < results.length; ++i) {
      var dockey = results[i].key;
      var docid = results[i].id;

      if (key !== undefined) {
        if (cbCompare(dockey, key) !== 0) {
          continue;
        }
      }
      if (keys !== undefined) {
        if (cbIndexOf(keys, dockey) < 0) {
          continue;
        }
      }

      if (startkey) {
        var startCompare = cbCompare(dockey, startkey);
        if (inclusive_start) {
          if (startCompare < 0) {
            continue;
          }
          if (startkey_docid && startCompare === 0 && cbCompare(docid, startkey_docid) < 0) {
            continue;
          }
        } else {
          if (startCompare <= 0) {
            continue;
          }
          if (startkey_docid && startCompare === 0 && cbCompare(docid, startkey_docid) <= 0) {
            continue;
          }
        }
      }

      if (endkey) {
        var endCompare = cbCompare(dockey, endkey);
        if (inclusive_end) {
          if (endCompare > 0) {
            continue;
          }
          if (endkey_docid && endCompare === 0 && cbCompare(docid, endkey_docid) > 0) {
            continue;
          }
        } else {
          if (endCompare >= 0) {
            continue;
          }
          if (endkey_docid && endCompare === 0 && cbCompare(docid, endkey_docid) >= 0) {
            continue;
          }
        }
      }

      if (!options.include_docs) {
        delete results[i].doc;
      }

      newResults.push(results[i]);
    }
    results = newResults;

    if (options.descending) {
      results.sort(function(a,b){
        if (a.key > b.key) { return -1; }
        if (a.key < b.key) { return +1; }
        if (a.id > b.id) { return -1; }
        if (a.id < b.id) { return +1; }
        return 0;
      });
    } else {
      results.sort(function(a,b){
        if (b.key > a.key) { return -1; }
        if (b.key < a.key) { return +1; }
        if (b.id > a.id) { return -1; }
        if (b.id < a.id) { return +1; }
        return 0;
      });
    }

    if (options.skip && typeof options.skip !== 'number')
      return callback(new Error('query_parse_error: Invalid value for integer parameter: "' + options.skip.toString() + '"'));
    if (options.limit && typeof options.limit !== 'number')
      return callback(new Error('query_parse_error: Invalid value for integer parameter: "' + options.limit.toString() + '"'));

    if (options.skip && options.limit) {
      results = results.slice(options.skip, options.skip + options.limit);
    } else if (options.skip) {
      results = results.slice(options.skip);
    } else if (options.limit) {
      results = results.slice(0, options.limit);
    }

    // Reduce Time!!
    if (reducer && options.reduce !== false) {
      var keys = [];
      for (var i = 0; i < results.length; ++i) {
        var keyN = cbNormKey(results[i].key, group_level);
        if (cbIndexOf(keys, keyN) < 0) {
          keys.push(keyN);
        }
      }

      var newResults = [];
      for (var j = 0; j < keys.length; ++j) {
        var values = [];
        for (var k = 0; k < results.length; ++k) {
          var keyN = cbNormKey(results[k].key, group_level);
          if (cbCompare(keyN, keys[j]) === 0) {
            values.push(results[k].value);
          }
        }
        var result = reducer(keys[j], values, false);
        newResults.push({
          key: keys[j],
          value: result
        });
      }
      results = newResults;
    }

    var meta = {
      total_rows: rowcount
    };

    callback(null, results, meta);
  });
}

function removeUndefinedProperties(obj) {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop) && obj[prop] === undefined) {
      delete obj[prop];
    }
  }
}

module.exports = function(bucket) {
  couchbase.ViewQuery.prototype.range = function(start, end, inclusive_end) {
    this.options.startkey = JSON.stringify(start);
    this.options.endkey = JSON.stringify(end);
    this.options.inclusive_end = (inclusive_end === false ? 'false' : undefined);
    return this;
  };

  if (bucket.constructor.name === 'Bucket') {
    var _view = bucket._view;
    bucket._view = function(viewtype, ddoc, name, q, callback) {
      removeUndefinedProperties(q);
      return _view.call(bucket, viewtype, ddoc, name, q, callback);
    };
  }

  if (bucket.constructor.name === 'MockBucket')
    bucket._execView = MockBucket_execView;
};
