var assert = require('assert');
var request = require('request');
var cuid = require('cuid');
var _ = require('lodash');
var async = require('async');
var fs = require('fs-extra');

describe('test apostrophe-headless', function() {

  var apos;
  var adminGroup;
  var bearer;

  this.timeout(5000);

  after(function(done) {
    apos.db.dropDatabase(function(err) {
      if (err) {
        console.error(err);
      }
      fs.removeSync(__dirname + '/public/uploads/attachments');
      done();
    });
  });

  it('initializes', function(done) {
    apos = require('apostrophe')({
      testModule: true,
      
      modules: {
        'apostrophe-express': {
          secret: 'xxx',
          port: 7900
        },
        'apostrophe-headless': {
          bearerTokens: true,
          apiKeys: [ 'skeleton-key' ]
        },
        'products': {
          extend: 'apostrophe-pieces',
          restApi: true,
          name: 'product',
          apiKeys: ['product-key' ],
          addFields: [
            {
              name: 'body',
              type: 'area',
              options: {
                widgets: {
                  'apostrophe-rich-text': {},
                  'apostrophe-images': {}
                }
              }
            },
            {
              name: 'color',
              type: 'select',
              choices: [
                {
                  label: 'Red',
                  value: 'red'
                },
                {
                  label: 'Blue',
                  value: 'blue'
                }
              ]
            },
            {
              name: 'photo',
              type: 'attachment',
              group: 'images'
            }
          ]
        },
        'apostrophe-images': {
          restApi: true
        },
        'apostrophe-users': {
          groups: [
            {
              title: 'admin',
              permissions: [ 'admin' ]
            }
          ]
        },
        'apostrophe-pages': {
          restApi: true,
          apiKeys: [ 'page-key' ],
          park: [
            {
              type: 'default',
              title: 'Tab One',
              slug: '/tab-one',
              _children: [
                {
                  type: 'default',
                  title: 'Tab One Child One',
                  slug: '/tab-one/child-one'
                },
                {
                  type: 'default',
                  title: 'Tab One Child Two',
                  slug: '/tab-one/child-two'
                },
              ]
            },
            {
              type: 'default',
              title: 'Tab Two',
              slug: '/tab-two',
              _children: [
                {
                  type: 'default',
                  title: 'Tab Two Child One',
                  slug: '/tab-two/child-one'
                },
                {
                  type: 'default',
                  title: 'Tab Two Child Two',
                  slug: '/tab-two/child-two'
                },
              ]
            },
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
  
  it('can locate the admin group', function(done) {
    return apos.docs.db.findOne({ title: 'admin', type: 'apostrophe-group' }, function(err, group) {
      assert(!err);
      assert(group);
      adminGroup = group;
      done();
    });
  });

  it('can insert a test user via apostrophe-users', function(done) {
    var user = apos.users.newInstance();

    user.firstName = 'test';
    user.lastName = 'test';
    user.title = 'test test';
    user.username = 'test';
    user.password = 'test';
    user.email = 'test@test.com';
    user.groupIds = [ adminGroup._id ];

    assert(user.type === 'apostrophe-user');
    assert(apos.users.insert);
    apos.users.insert(apos.tasks.getReq(), user, function(err) {
      assert(!err);
      done();
    });

  });    

  it('can log in via REST as that user, obtain bearer token', function(done) {
    http('/api/v1/login', 'POST', {}, {
      username: 'test',
      password: 'test'
    }, undefined, function(err, result) {
      assert(!err);
      assert(result && result.bearer);
      bearer = result.bearer;
      done();
    });
  });
  
  it('cannot POST a product without a bearer token', function(done) {
    http('/api/v1/products', 'POST', {}, {
      title: 'Fake Product',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>This is fake</p>'
          }
        ]
      }
    }, undefined, function(err, response) {
      assert(err);
      done();
    });
  });
  
  var updateProduct;
  
  it('can POST products with a bearer token, some published', function(done) {
    // range is exclusive at the top end, I want 10 things
    var nths = _.range(1, 11);
    return async.eachSeries(nths, function(i, callback) {
      http('/api/v1/products', 'POST', {}, {
        title: 'Cool Product #' + i,
        published: !!(i & 1),
        body: {
          type: 'area',
          items: [
            {
              type: 'apostrophe-rich-text',
              id: cuid(),
              content: '<p>This is thing ' + i + '</p>'
            }
          ]
        }
      }, bearer, function(err, response) {
        assert(!err);
        assert(response);
        assert(response._id);
        assert(response.title === 'Cool Product #' + i);
        assert(response.slug === 'cool-product-' + i);
        assert(response.type === 'product');
        if (i === 1) {
          updateProduct = response;
        }
        return callback(null);
      });
    }, function(err) {
      assert(!err);
      done();
    });
  });

  it('can GET five of those products without a bearer token', function(done) {
    return http('/api/v1/products', 'GET', {}, {}, undefined, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.results);
      assert(response.results.length === 5);
      done();
    });
  }); 

  it('Request with an invalid bearer token is a 401, even if it would otherwise be publicly accessible', function(done) {
    return http('/api/v1/products', 'GET', {}, {}, 'madeupbearertoken', function(err, response) {
      assert(err);
      assert(err.status === 401);
      assert(err.body.error);
      assert(err.body.error === 'bearer token invalid');
      done();
    });
  }); 

  it('can GET five of those products with a bearer token and no query parameters', function(done) {
    return http('/api/v1/products', 'GET', {}, {}, bearer, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.results);
      assert(response.results.length === 5);
      done();
    });
  });

  it('can GET all ten of those products with a bearer token and published: "any"', function(done) {
    return http('/api/v1/products', 'GET', { published: "any" }, {}, bearer, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.results);
      assert(response.results.length === 10);
      done();
    });
  });

  var firstId;
  
  it('can GET only 5 if perPage is 5', function(done) {
    http('/api/v1/products', 'GET', { perPage: 5, published: 'any' }, {}, bearer, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.results);
      assert(response.results.length === 5);
      firstId = response.results[0]._id;
      assert(response.pages === 2);
      done();
    });
  });

  it('can GET a different 5 on page 2', function(done) {
    http('/api/v1/products', 'GET', { perPage: 5, published: 'any', page: 2 }, {}, bearer, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.results);
      assert(response.results.length === 5);
      assert(response.results[0]._id !== firstId);
      assert(response.pages === 2);
      done();
    });
  });

  it('can update a product', function(done) {
    http('/api/v1/products/' + updateProduct._id, 'PUT', {}, _.assign(
      {}, 
      updateProduct,
      {
        title: 'I like cheese',
        _id: 'should-not-change'
      }
    ), bearer, function(err, response) {
      assert(!err);
      assert(response);
      assert(response._id === updateProduct._id);
      assert(response.title === 'I like cheese');
      assert(response.body.items.length);
      done();
    });
  });

  it('fetch of updated product shows updated content', function(done) {
    http('/api/v1/products/' + updateProduct._id, 'GET', {}, {}, bearer, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.title === 'I like cheese');
      assert(response.body.items.length);
      done();
    });
  });
  
  it('can delete a product', function(done) {
    http('/api/v1/products/' + updateProduct._id, 'DELETE', {}, {}, bearer, function(err, response) {
      assert(!err);
      done();
    });
  });
  
  it('cannot fetch a deleted product', function(done) {
    http('/api/v1/products/' + updateProduct._id, 'GET', {}, {}, bearer, function(err, response) {
      assert(err);
      done();
    });
  });

  it('can insert a product with the skeleton api key, via query string', function(done) {
    http('/api/v1/products', 'POST', { apiKey: 'skeleton-key' }, {
      title: 'Skeleton Key Product',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>This is the skeleton key product</p>'
          }
        ]
      }
    }, undefined, function(err, response) {
      assert(!err);
      done();
    });
  });

  it('can insert a product with the products-only api key, via query string', function(done) {
    http('/api/v1/products', 'POST', { apiKey: 'product-key' }, {
      title: 'Product Key Product',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>This is the product key product</p>'
          }
        ]
      }
    }, undefined, function(err, response) {
      assert(!err);
      done();
    });
  });

  it('can insert a product with the skeleton api key, via auth header', function(done) {
    http('/api/v1/products', 'POST', { apiKey: 'product-key' }, {
      title: 'Product Key Product',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>This is the product key product</p>'
          }
        ]
      }
    }, undefined, { 
      headers: {
        'Authorization': 'Api-Key skeleton-key'
      }
    }, function(err, response) {
      assert(!err);
      done();
    });
  });

  it('cannot insert a product with a bad api key, via query string', function(done) {
    http('/api/v1/products', 'POST', { apiKey: 'woo-woo' }, {
      title: 'Bogus Product',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>This is the bogus product</p>'
          }
        ]
      }
    }, undefined, function(err, response) {
      assert(err);
      done();
    });
  });

  var attachment;
  var productWithPhoto;
  
  it('can post an attachment with a bearer token', function(done) {
    return request({
      url: 'http://localhost:7900/api/v1/attachments',
      method: 'POST',
      formData: {
        file: fs.createReadStream(__dirname + '/test-image.jpg')
      },
      json: true,
      auth: { bearer: bearer }    
    }, function(err, response, body) {
      assert(!err);
      assert(response.statusCode < 400);
      assert(typeof(body) === 'object');
      assert(body._id);
      attachment = body;
      done();
    });
  });

  it('can post an attachment with the skeleton API key (query string)', function(done) {
    return request({
      url: 'http://localhost:7900/api/v1/attachments?apikey=skeleton-key',
      method: 'POST',
      formData: {
        file: fs.createReadStream(__dirname + '/test-image.jpg')
      },
      json: true
    }, function(err, response, body) {
      assert(!err);
      assert(response.statusCode < 400);
      assert(typeof(body) === 'object');
      assert(body._id);
      done();
    });
  });

  it('can post an attachment with the product API key (query string)', function(done) {
    return request({
      url: 'http://localhost:7900/api/v1/attachments?apikey=product-key',
      method: 'POST',
      formData: {
        file: fs.createReadStream(__dirname + '/test-image.jpg')
      },
      json: true
    }, function(err, response, body) {
      assert(!err);
      assert(response.statusCode < 400);
      assert(typeof(body) === 'object');
      assert(body._id);
      done();
    });
  });

  it('can post an attachment with the skeleton API key (via auth header)', function(done) {
    return request({
      url: 'http://localhost:7900/api/v1/attachments',
      method: 'POST',
      formData: {
        file: fs.createReadStream(__dirname + '/test-image.jpg')
      },
      json: true,
      headers: {
        'Authorization': 'ApiKey skeleton-key'
      }
    }, function(err, response, body) {
      assert(!err);
      assert(response.statusCode < 400);
      assert(typeof(body) === 'object');
      assert(body._id);
      done();
    });
  });

  it('cannot post an attachment without any api key', function(done) {
    return request({
      url: 'http://localhost:7900/api/v1/attachments',
      method: 'POST',
      formData: {
        file: fs.createReadStream(__dirname + '/test-image.jpg')
      },
      json: true
    }, function(err, response, body) {
      assert(!err);
      assert(response.statusCode >= 400);
      done();
    });
  });

  it('can upload a product containing an attachment', function(done) {
    http('/api/v1/products', 'POST', {}, {
      title: 'Product With Photo',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>Has a Photo</p>'
          }
        ]
      },
      photo: attachment
    }, bearer, function(err, response) {
      assert(!err);
      assert(response);
      productWithPhoto = response;
      done();
    });
  });

  it('can GET a product containing an attachment and it has image URLs', function(done) {
    http('/api/v1/products/' + productWithPhoto._id, 'GET', {}, undefined, undefined, function(err, response) {
      assert(!err);
      assert(response);
      assert(response._id === productWithPhoto._id);
      assert(response.photo);
      assert(response.photo._id === attachment._id);
      assert(response.photo._urls);
      assert(response.photo._urls.original);
      assert(response.photo._urls.full);
      done();
    });
  });

  it('can log out to destroy a bearer token', function(done) {
    http('/api/v1/logout', 'POST', {}, {}, bearer, function(err, result) {
      assert(!err);
      done();
    });
  });

  it('cannot POST a product with a logged-out bearer token', function(done) {
    http('/api/v1/products', 'POST', {}, {
      title: 'Fake Product After Logout',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>This is fake</p>'
          }
        ]
      }
    }, bearer, function(err, response) {
      assert(err);
      done();
    });
  });

  var tabOneId;

  it('can get the home page and its children', function(done) {
    return http('/api/v1/pages', 'GET', {}, {}, undefined, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.slug === '/');
      assert(response._children);
      assert(response._children.length === 2);
      assert(response._children[0].title === 'Tab One');
      assert(response._children[1].title === 'Tab Two');
      assert(!response._children[0]._children);
      tabOneId = response._children[0]._id;
      assert(tabOneId);
      done();
    });
  });

  it('can get an individual page by id, with its children', function(done) {
    return http('/api/v1/pages/' + tabOneId, 'GET', {}, {}, undefined, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.slug === '/tab-one');
      assert(response._children);
      assert(response._children.length === 2);
      assert(response._children[0].title === 'Tab One Child One');
      assert(response._children[1].title === 'Tab One Child Two');
      assert(!response._children[0]._children);
      done();
    });
  });

  it('cannot get the entire page tree without an api key', function(done) {
    return http('/api/v1/pages', 'GET', { all: 1 }, {}, undefined, function(err, response) {
      assert(err);
    });
  });

  it('can get the entire page tree with an api key', function(done) {
    return http('/api/v1/pages', 'GET', { all: 1 }, {}, undefined, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.slug === '/');
      assert(response._children);
      assert(response._children.length === 2);
      assert(response._children[0].title === 'Tab One');
      assert(response._children[1].title === 'Tab Two');
      assert(response._children[0]._children);
      assert(response._children[0]._children.length === 2);
      done();
    });
  });

  var newPage;

  it('can insert a new grandchild page with the pages key', function(done) {
    http('/api/v1/pages', 'POST', { apiKey: 'page-key' }, {
      title: 'Tab One Child Three',
      body: {
        type: 'area',
        items: [
          {
            type: 'apostrophe-rich-text',
            id: cuid(),
            content: '<p>This is tab one child three</p>'
          }
        ]
      }
    }, undefined, function(err, response) {
      assert(!err);
      assert(response.level === 2);
      assert(response.path === '/tab-one/tab-one-child-three');
      newPage = response;
      done();
    });
  });

  it('can update grandchild page with the pages key', function(done) {
    newPage.title = 'Tab One Child Three Modified';
    http('/api/v1/pages', 'PUT', { apiKey: 'page-key' }, newPage, undefined, function(err, response) {
      assert(!err);
      done();
    });
  });

  it('can "delete" grandchild page', function(done) {
    http('/api/v1/pages/' + newPage._id, 'DELETE', { apiKey: 'page-key' }, {}, undefined, function(err, response) {
      assert(!err);
      done();
    });
  });

  it('can turn a child into a grandchild', function(done) {
    http('/api/v1/pages/move/' + tabOneId, 'POST', { apiKey: 'page-key' }, {
      relatedId: tabTwoId,
      relationship: 'inside'
    }, undefined, function(err, response) {
      assert(!err);
      done();
    });
  });

  it('page tree reflects move of child to be grandchild', function(done) {
    return http('/api/v1/pages', 'GET', { all: 1 }, {}, undefined, function(err, response) {
      assert(!err);
      assert(response);
      assert(response.slug === '/');
      assert(response._children);
      assert(response._children.length === 1);
      assert(response._children[0].title === 'Tab Two');
      assert(response._children[0]._children && (response._children[0]._children.length === 3));
      assert(response._children[0]._children[2].title === 'Tab One');
      done();
    });
  });

});

function http(url, method, query, form, bearer, extra, callback) {
  if (arguments.length === 6) {
    callback = extra;
    extra = null;
  }
  var args = {
    url: 'http://localhost:7900' + url,
    qs: query || undefined,
    form: ((method === 'POST') || (method === 'PUT')) ? form : undefined,
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
