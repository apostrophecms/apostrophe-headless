var assert = require('assert');
var request = require('request');
var _ = require('lodash');
var Promise = require('bluebird');

// So far this is a very basic test of public read access to the live locales,
// which is what has been implemented so far for workflow

describe('test apostrophe-headless with workflow', function() {

  var apos;

  this.timeout(20000);

  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, done);
  });

  it('initializes', function(done) {
    apos = require('apostrophe')({
      testModule: true,
      shortName: 'apostrophe-headless-test',
      modules: {
        'apostrophe-express': {
          secret: 'xxx',
          port: 7900
        },
        'apostrophe-headless': {},
        'apostrophe-pages': {
          restApi: true
        },
        'products': {
          extend: 'apostrophe-pieces',
          restApi: true,
          name: 'product'
        },
        'apostrophe-workflow': {
          defaultLocale: 'en',
          locales: [
            {
              name: 'master',
              private: true,
              children: [
                {
                  name: 'en',
                  label: 'English'
                },
                {
                  name: 'es',
                  label: 'Spanish'
                }
              ]
            }
          ]
        }
      },
      afterInit: function(callback) {
        // Should NOT have an alias!
        assert(!apos.restApi);
        assert(apos.modules['products']);
        assert(apos.modules['products'].addRestApiRoutes);
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('can insert test documents (live) via raw mongo to enable read tests', function() {
    var docs = [];
    var workflow = apos.modules['apostrophe-workflow'];
    _.each(_.keys(workflow.locales), function(locale) {
      docs.push(
        {
          type: 'product',
          title: 'product test',
          slug: 'product-test',
          _id: 'product' + locale,
          workflowGuid: 'producttest',
          workflowLocale: locale,
          published: true
        }
      );
    });
    return apos.docs.db.insert(docs);
  });

  it('can access the appropriate product for each locale via GET requests with _workflowLocale query parameter', function() {
    var workflow = apos.modules['apostrophe-workflow'];
    var locales = _.keys(workflow.locales);
    locales = _.filter(locales, function(locale) {
      return (!workflow.locales[locale].private) && (workflow.liveify(locale) === locale);
    });
    return Promise.mapSeries(locales, function(locale) {
      return http('/api/v1/products', 'GET', { _workflowLocale: locale }, {}, undefined).then(function(response) {
        assert(response);
        assert(response.results);
        assert(response.results.length === 1);
        assert(response.results[0].workflowLocale === locale);
        assert(response.results[0]._id === ('product' + locale));
      });
    });
  });

  it('can access the appropriate homepage for each locale via GET requests with _workflowLocale query parameter', function() {
    var workflow = apos.modules['apostrophe-workflow'];
    var locales = _.keys(workflow.locales);
    locales = _.filter(locales, function(locale) {
      return (!workflow.locales[locale].private) && (workflow.liveify(locale) === locale);
    });
    return Promise.mapSeries(locales, function(locale) {
      return http('/api/v1/apostrophe-pages', 'GET', { _workflowLocale: locale }, {}, undefined).then(function(response) {
        assert(response);
        assert(response.workflowLocale === locale);
        assert(response.path === '/');
      });
    });
  });

});

function http(url, method, query, form, bearer, extra) {
  return Promise.promisify(body)();
  function body(callback) {
    if (arguments.length === 6) {
      callback = extra;
      extra = null;
    }
    var args = {
      url: 'http://localhost:7900' + url,
      qs: query || undefined,
      form: ((method === 'POST') || (method === 'PUT') || (method === 'PATCH')) ? form : undefined,
      method: method,
      json: true,
      auth: bearer ? { bearer: bearer } : undefined
    };
    if (extra) {
      _.assign(args, extra);
    }
    return request(args, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode >= 400) {
        return callback({ status: response.statusCode, body: body });
      }
      return callback(null, body);
    });
  }
}
