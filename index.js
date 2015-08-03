var fix = require('./lib/fix');

module.exports = function(options) {
	if (!options.bucket) throw new Error('bucket is not defined');
	
	if (options.fix)
		fix(options.bucket);

	var retry = require('./lib/retry')(options);

	return {
		Multi: require('./lib/Multi')(options, retry),
		provide: require('./lib/provide')(options, retry),
		retry: retry,
		updateDdocs: require('./lib/updateDdocs')(options, retry),
	};
};
