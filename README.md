## Apostrophe as a headless CMS - With single page request by slug

This fork of apostrophe-headless was created to serve my needs for a specific project. I will maintain it as apostrophe-headless updates as long as this is not an option in the main repo. I am open to pull-requests if there are suggestions on abstracting the slug value. 

[Apostrophe](http://apostrophecms.org) is great for building websites, but many projects these days just need a "headless" CMS: an easy way to create new content types by defining schemas and immediately have a friendly interface for managing them on the back end... and REST APIs on the front end for React, React Native and other frontend frameworks to talk to.

Just as often, projects call for a mix of the two: Apostrophe as a CMS for the pages of the site, with React-style apps "mixed in" on certain pages.

The `apostrophe-headless` module provides REST APIs for content types created with Apostrophe's [pieces](http://apostrophecms.org/docs/tutorials/getting-started/reusable-content-with-pieces.html) feature. With this module, you might choose to just click "Page Settings" and lock down the "home page" of your site to "logged in users only," then use Apostrophe as a pure headless CMS... or you might mix and match. It's up to you.

> We'll start out by talking about pieces, because they map so well to REST concepts. But `apostrophe-headless` also supports working with pages. We recommend you read about pieces first to figure out the basics, especially authentication.

## Adding a REST API for products

Let's assume you have a module called `products` that extends `apostrophe-pieces` as described in our [reusable content with pieces](http://apostrophecms.org/docs/tutorials/getting-started/reusable-content-with-pieces.html) tutorial. Now you want a REST API so your app can easily get information about pieces.

## Install the package

```
npm install apostrophe-headless
```

## Turn it on

```javascript
// in app.js
modules: {

  'apostrophe-headless': {},

  'products': {
    // Usually you'll put most of this in lib/products/index.js
    extend: 'apostrophe-pieces',
    name: 'product',
    // etc...
    restApi: true
  }
}
```

### Configuration options

You can also pass options for the REST API:x

```javascript
  'products': {
    // etc...
    restApi: {
      // max 50 pieces per API result (the default)
      maxPerPage: 50,
      // Allow the public API to invoke additional
      // cursor filters. Note that most schema
      // fields have a cursor filter available
      safeFilters: [ 'slug' ]
    }
  }
}
```

> Setting `maxPerPage` high can have performance impacts. Consider designing your app with pagination or infinite scroll in mind rather than fetching thousands of pieces the user will not actually look at.

> All of the documentation below discusses the `products` example above. Of course you may also configure the `restApi` option for other modules that extend pieces.

## Retrieving all the products

Now your app can access:

`/api/v1/products`

To get the first page of products (50 per page, unless `maxPerPage` is adjusted as shown above). The response is JSON. See the `results` property for an array of products included in the first page, and the `pages` property for the total number of pages. 

If you want to fetch a second page of products:

`/api/v1/products?page=2`

To avoid performance issues we do not send more than 50 products per API call. Your app should make additional queries as needed.

### Filtering products

Here are some examples:

`/api/v1/products?search=cheese`

`/api/v1/products?autocomplete=che`

There's much more. You can use any [cursor filter](http://apostrophecms.org/docs/tutorials/intermediate/cursors.html) that offers a `sanitize` method via the query string. It's [not hard to add custom filters](http://apostrophecms.org/docs/tutorials/intermediate/cursors.html#custom-filters) if you need to, but keep in mind that most schema field types have built-in [filter support](http://apostrophecms.org/docs/tutorials/intermediate/cursors.html).

To call most filters from the public API, you will need to use the `safeFilters` option to declare these filters "safe.". Rather than just `restApi: true`, write:

```javascript
'my-module': {
  restApi: {
    // We're assuming here that you have added fields
    // called 'color' and 'brand' in your schema
    safeFilters: [ 'slug', 'color', 'brand' ]
  }
}
```

### Access as a logged-in user

If you are accessing the API as a user who can edit this piece type, you can use all cursor filters intended for web use, otherwise only the filters marked `safeFor: 'public'`.

## Retrieving one product

You can also retrieve one product via its `_id` property:

`/api/v1/products/cxxxxxxx`

The response is a single JSON object containing the product.

Even though you are fetching just one product, you can still invoke filters via the query string. If you are carrying out this request with the privileges of an admin user, you might want to add `?published=any` to gain access to an unpublished product.

## Inserting, updating and deleting products

These operations follow the usual REST patterns. But first, we need to talk about permissions.

## Invoking APIs when logged out

This is simple: if the user is not logged in, they will be able to `GET` public, published content, and that's all.

For many apps, **that's fine. You're using Apostrophe's admin bar to create the content anyway.**

Your content editors log into a site that's just for content creation, and your app users pull content from it via REST APIs. Great! **You're done here.**

But for those who need to create and manage content via REST too... read on!

## Invoking REST APIs as a logged-in user of your Apostrophe site

If you're building a React app or similar that is part of a webpage delivered by your Apostrophe site, and the right user is already logged into the site, then the APIs will automatically "see" the user and run with the right permissions. However, see the note that follows re: CSRF protection.
 
> If this doesn't sound relevant to your project, skip ahead to learn how to use API keys and bearer tokens instead. We've got your back, headless horseman.

## CSRF protection and logged-in users

**If an API request comes from an Apostrophe user who logged in conventionally via the website,** and not via the REST login APIs below, then Apostrophe will check for CSRF (Cross-Site Request Forgery) attacks. 

If your API request is being sent by jQuery as provided by Apostrophe, you're good to go: Apostrophe automatically adds the necessary header.

If your API request is sent via `fetch` or another alternative to jQuery, you'll need to set the `X-XSRF-TOKEN` HTTP header to the current value of `window.apos.csrfCookieName`. This ensures the request didn't come from a sneaky form on a third-party website.

## Building apps without Apostrophe UI: bearer tokens and API keys

By default, the `POST`, `DELETE` and `PUT` APIs are available to logged-in users of the site. This is quite useful if you want to provide some editing features in a React or similar app that is part of your Apostrophe site.

But for a standalone app that uses Apostrophe as a headless backend, and isn't part of your Apostrophe site in any other way, logging in via Apostrophe's interface might not be an option.

For such cases, you can log in via REST and obtain a "bearer token" to be sent with requests. Or, you can use a hardcoded API key with total admin access. We'll look at API keys first, to help you get started. Then we'll look at bearer tokens.

### Working with API keys

It's easy to configure API keys to have **full admin access to all content** for which the REST API has been activated:

```javascript
// in app.js
modules: {
  'apostrophe-headless': {
    apiKeys: [ 'example-i-sure-hope-you-changed-this' ]
  },
  products: {
    extend: 'apostrophe-pieces',
    name: 'product',
    restApi: true
  },
  locations: {
    extend: 'apostrophe-pieces',
    name: 'location',
    restApi: true
  }
}
```

You can also configure api keys for a single module:

```javascript
// in app.js
modules: {
  'apostrophe-headless': {
    // This option MUST EXIST to allow api keys at all. If you
    // do not want any global api keys, leave it empty
    apiKeys: []
  },
  products: {
    extend: 'apostrophe-pieces',
    name: 'product',
    restApi: true,
    apiKeys: [ 'i-only-grant-access-to-this-one-module' ]
  },
  locations: {
    extend: 'apostrophe-pieces',
    name: 'location',
    restApi: true
  }
}
```

> Either way, the api key is allowed to create attachments (see [Images, files and attachments in REST](#images-files-and-attachments-in-rest)).

Now you can pass the API key in either of two ways when [inserting a product](#inserting-a-product) or making a similar request:

1. Just add an `apikey` property to the query string. **This goes in the query string regardless of the request method.**

Example:

`POST /api/v1/products?apikey=example-api-key`

The body of the POST may be a JSON body or use the traditional url encoding, as described below; the important thing is that the apikey is separate, in the query string, as shown here.

2. Pass an `Authorization` header as part of your HTTP request:

`Authorization: ApiKey your-api-key-goes-here`

> **Always secure sites that accept API keys with HTTPS.** You should never send an API key over "plain HTTP." Of course, browsers are starting to deprecate sites that don't accept HTTPS anyway!

#### When NOT to use API keys

API keys are useful for hardcoded situations where **there is no way an untrusted user could ever see them.** For instance, it's fine to use an API key for back-end communication between two servers.

However, you should **never use api keys in the code of a mobile app, browser-based web app, JavaScript in the browser of any kind** or other situation where code might be viewed as source, decompiled, etc. In these situations, you must use bearer tokens, which are specific to a user.

### Using bearer tokens

Bearer tokens are a way to let users log in even though they never see an Apostrophe-powered website. They allow you to implement your own login mechanism in your mobile app.

> Using bearer tokens only makes sense if you are using Apostrophe as your authentication system. If you are using `apostrophe-passport` to connect Apostrophe to google login, Twitter login, etc., you'll need to log users in via the Apostrophe site and then deliver your app via a stripped-down Apostrophe "home page" on that site. See the notes above re: working smoothly with our CSRF protection in this configuration.

#### How to log users in with bearer tokens

1. Turn on support for bearer tokens:

```javascript
// in app.js
modules: {
  'apostrophe-headless': {
    bearerTokens: true
  }
}
```

By default bearer tokens last 2 weeks, which is very secure but can be frustrating for casual apps that don't contain sensitive data. Here's how to set the bearer token lifetime:

```javascript
// in app.js
modules: {
  'apostrophe-headless': {
    bearerTokens: {
      // 4 weeks, in seconds
      lifetime: 86400 * 7 * 4
    }
  }
}
```

2. Send a `POST` request to:

`/api/v1/login`

With `username` and `password` properties in the body.

3. On success, you will receive a JSON object with a single property: `bearer`.

4. For all of the REST API calls that follow, pass that value as the `Authorization` header, preceded by `Bearer` and a space:

`Bearer nnnn`

Where `nnnn` should be replaced with the value of the `bearer` property you received.

There is **no need to pass the XSRF header** when using a valid bearer token because bearer tokens are never part of an Apostrophe session.
 
5. If you receive a `401 Unauthorized` response to a later API request, consider making another `login` call to obtain a new bearer token. The expiration of bearer tokens depends on the `expires` setting as shown earlier.

6. If the user logs out of your app, send a POST request as follows:

`/api/v1/logout`

With the appropriate `Bearer` heading as for any other request. That bearer token will be invalidated.

> **Always secure sites that accept bearer tokens with HTTPS.** Of course, browsers are starting to deprecate sites that don't accept HTTPS anyway!
>
> **If you submit an invalid or outdated bearer token for any request**, you will receive a `401` HTTP status, and a JSON object with an `error` property set to `'bearer token invalid'`. This is your cue to ask the user to log in again and then retry the request.

## Inserting a product

You can insert a product via a POST request. You should POST to:

`/api/v1/products`

The body of your POST should contain all of the schema fields you wish to set.

You may use either traditional URL-style encoding or a JSON body. **However if you are working with Apostrophe areas you must use a JSON body** (see below).

On success you will receive a 200 status code and a JSON object containing the new product.

## Updating a product

To update a product **completely, sending all the data again**, make a PUT request. Send it to:

`/api/v1/products/cxxxxxxx`

Where `cxxxxxxx` is the `_id` property of the existing product you wish to update.

On success you will receive a 200 status code and the updated JSON object representing the product.

You may use either traditional URL-style encoding or a JSON body. **However if you are working with Apostrophe areas you must use a JSON body** (see below).

> If you want to update just SOME of the properties, without the risk that some of your other data is incomplete or out of date, use PATCH (see below).

## Patching a product

To patch a product **partially, sending only the changes**, make a `PATCH` request. Send it to:

`/api/v1/products/cxxxxxxx`

Where `cxxxxxxx` is the `_id` property of the existing product you wish to patch. Use the `PATCH` HTTP method.

Include only the properties you wish to change. If a property is present in your request body, it will be updated. If it is present, but empty, it will be updated to an empty value, which may or may not be accepted depending on your schema.

On success you will receive a 200 status code and the updated JSON object representing the entire product.

You may use either traditional URL-style encoding or a JSON body. **However if you are working with Apostrophe areas you must use a JSON body** (see below).

### Patching just part of an array property

You may also `PATCH` an array property without re-sending the entire array. `apostrophe-headless` supports several operators based on the MongoDB operators of the same name.

> To use this feature, you MUST use a JSON body, not traditional URL-style encoding.

If your schema includes this field:

```javascript
{
  name: 'addresses',
  type: 'array',
  schema: [
    {
      name: 'street',
      type: 'string'
    }
  ]
}
```

Then you may carry out the following operations:

#### `$push`: append one

```javascript
{
  $push: {
    addresses: {
      street: '103 Test Lane'
    }
  }
}
```

#### `$push` with `$each`: append many

```javascript
{
  $push: {
    addresses: {
      $each: [
        {
          street: '104 Test Lane'
        },
        {
          street: '105 Test Lane'
        },
        {
          street: '106 Test Lane'
        },
      ]
    }
  }
}
```

### `$pullAll`: remove array entries matching complete value

```javascript
{
  $pullAll: {
    addresses: [ addresses[0] ]
  }
}
```

### `$pullAllById`: remove array entries matching `id` or `_id` property

```javascript
$pullAllById: {
  addresses: [ addresses[0].id ]
}
```

> "But where do I get `addresses[0].id` from?" Typically from an earlier `GET` or `POST` operation.

> Array operators can be used to manipulate `array` schema fields, the widget array of an area, or the `idsField` of a join.

## Deleting a product

To delete a product, make a DELETE request. Send it to:

`/api/v1/products/cxxxxxxx`

Where `cxxxxxxx` is the `_id` property of the existing product you wish to delete.

The response will be an appropriate HTTP status code.

## Inserting areas and widgets via REST

Given how powerful they are, [areas and widgets](http://apostrophecms.org/docs/tutorials/getting-started/adding-editable-content-to-pages.html) in Apostrophe are surprisingly easy to work with via the REST API.

Just bear these facts in mind:

* Singletons are just areas restricted to one widget of a specified type when edited via the website. There's no difference in the database, and none in your API calls. So everything you read below applies to them too.
* An area is just a property of the piece. It is an object with a `type` property equal to `area`, and an `items` array containing the widgets that make up the area.
* Each widget in the area must have a unique `id` property (we recommend that you use the `cuid` npm module like we do), and a `type` property set to the name of the widget. That is, if it comes from the `people-widgets` module, the `type` property will just be `people`.
* Other properties are specific to each widget type, based on its schema. It's often helpful to use the MongoDB shell to investigate a few examples in your site's database.
* Rich text widgets contain markup in a `content` property.
* Array schema fields have `type: "array"` and an `items` array containing their content. Each item must have a unique `id` property.
* **You must fully specify your areas and singletons in the schema of your piece type or page type,** including passing all the options you would otherwise pass in a template. Since templates are not in play there would otherwise be no validation of appropriate widget types.

Here's an example of a simple area containing a standard `apostrophe-rich-text` widget, a "nav" widget specific to a particular site which contains an `array` schema field, and a standard `apostrophe-images` widget:

```javascript
body: {
  type: 'area',
  items: [
    {
      id: 'cxxxxx1',
      type: 'apostrophe-rich-text',
      content: '<h4>Subheading</h4><p>Here is some text.</p>'
    },
    {
      id: 'cxxxxx2',
      type: 'nav',
      links: {
        type: 'array',
        items: [
          {
            id: 'cxxxxx3',
            url: 'http://cnn.com',
            label: 'CNN'
          },
          {
            id: 'cxxxxx4',
            url: 'http://google.com',
            label: 'Google'
          },
        ]
      }
    },
    {
      id: 'cxxxxx5',
      type: 'apostrophe-images',
      by: 'id',
      pieceIds: [ 'imageid1', 'imageid2' ]
    }
  ]
}
```

We'll see how `pieceIds` works in the `apostrophe-images` widget in a moment when we discuss images, files and attachments in REST.

## Joins in REST

When retrieving pieces, joined content is included, via the join field's name, as you might expect.

When inserting or updating pieces, it is possible to set a join. You will need to set the `idField` (for `joinByOne`) or `idsField` (for `joinByArray`) corresponding to the join. If you did not explicitly configure these when configuring the join in your schema, they are based on the name of the join:

`_stores` -> `storeIds`

`_owner` -> `ownerId`

etc. Set that property to the appropriate ID or array of IDs.

## Images, files and attachments in REST

It is possible to attach files to a new or updated piece. To do so you will first need to understand how attachments work in Apostrophe. In most cases, you'll also need understand how `apostrophe-images` and `apostrophe-files` widgets work.

### Attachment fields

`attachment` is a special schema field type. Ideally, files attached to a piece would live right inside it. However since files are large and it does not make sense to resend the same file every time you update a piece, you will instead need to first send Apostrophe the file and obtain an attachment object. You can then use that attachment object as the value of any field of type `attachment`. Think of the attachment as a "pointer" to the real file on disk.

To send an attachment, POST a file (using the `multipart/form-data` encoding) to the following URL:

`/api/v1/attachments`

Send the actual file as the `file` field in your form submission.

> The user POSTing the attachments must have the `edit-attachment` permission. POST is currently the only method provided for attachments.

On success, you will receive a JSON object containing properties similar to these:

```
{
  _id: 'attachmentidnnnn',
  width: 500,
  height: 400,
  group: 'images',
  extension: 'jpg',
  name: 'cleaned-up-name-without-extension'
}
```

> The `content-type` of the response will be `text/plain`, for backwards compatibility with certain browsers, but it will contain valid JSON.

**You can now send this object as the value of any `attachment` schema field when communicating with the REST API.**

### Using attachments directly

If you're doing most of your editing through the REST API, or your content types don't really need a shared image library from which images can be chosen by the end user, you might just add a schema field like this in your module:

```javascript
addFields: [
  {
    type: 'attachment',
    name: 'snapshot',
    // Accepts only images. Can also specify `office`
    // to accept workplace document formats
    groups: [ 'images' ]
  }
]
```

Then you can simply pass the `file` object you received from the attachments API as the `snapshot` property when POSTing a product.

> Later, when you `GET` this product from the API, you'll note that the attachment has a `._urls` property with versions of various sizes for your use. To make those URLs absolute, set the `baseUrl` option for your site in `app.js`. This is a top-level option, like `shortName`. It does not belong to a specific module. It should be set to the URL of your site, without any path part. In production, that might look like  `http://example.com` while in development, it might look like: `http://localhost:3000`

### Working with the shared media library

Sometimes, you'll want to introduce an image to the shared media library of Apostrophe and reference it via an images widget. Here's how to do that.

### Working with `apostrophe-images` and `apostrophe-files`

Often you'll use a widget of type `apostrophe-images` or `apostrophe-files` to display a slideshow of images, or a download button for a file. This allows the user to choose them from a shared media library. If you're doing at least some of your editing through Apostrophe then this is an attractive option.

So if you want to create these widgets with the REST API, you'll need to first use the technique above to create an attachment.

> Here we're assuming a `singleton` field called `thumbnail` containing an `apostrophe-images` widget is part of your schema for `projects`. In the database, both areas and singletons are simply stored as areas. The only difference is that the end user can't put more than one widget in a singleton via the editor.

So, **make sure you turn on the REST API for `apostrophe-images` too.** Images are pieces in their own right:

```javascript
// in app.js
modules: {
  'apostrophe-images': {
    restApi: true
  },
  // etc
}
```

> Note that the user POSTing these images must have `edit` permission for both images *and* products.

Now, POST to `/api/v1/apostrophe-images`. You'll need to supply at least `title`, `slug`, and `attachment`. The `attachment` field must contain the `file` object you received from the attachment upload API, above.

> Just set `attachment` to `result.file`, where `result` is the JSON object you got back from the upload API.

You will receive a JSON object in response. Using the `_id` property, you can create a project that includes that file in an images widget, in an area called `thumbnail`. POST an object like this to `/api/v1/projects` to create a project with a thumbnail:

```javascript
{
  title: 'My Project',
  slug: 'my-project',
  thumbnail: {
    type: 'area',
    items: [
      {
        type: 'apostrophe-images',
        by: 'id',
        pieceIds: [ yourImageId ]
      }
    ]
  }
}
```

Set `yourImageId` to the `_id` of the object you received when you POSTed to `/api/v1/apostrophe-images`.

## Working with pages

The examples above all concern pieces. Pieces are the most natural candidate for a REST API, but you can also use `apostrophe-headless` to work with pages:

```javascript
modules: {

  'apostrophe-headless': {},

  'apostrophe-pages': {
    restApi: true
  }
}
```

## Retrieving the home page and its children

Now your app can access:

`/api/v1/apostrophe-pages`

To get information about the home page and its children. The response is a single JSON object with `slug`, `path`, `title`, `type`, `_url` and other properties describing the home page, similar to the way pieces are returned (see the "products" examples above). In addition, information about children of the home page is returned.

### Accessing child pages

Basic information about the top-level children of the home page (aka the "tabs" of your site) is available in the `_children` property of the returned object. This property is an array. Each element has, at a minimum, `_id`, `title`, `type` and `slug` properties.

### Fetching detailed information about one page

Armed with the `_id`, you can obtain detailed information about a page by making a separate API request:

`/api/v1/apostrophe-pages/ID_GOES_HERE`

A page returned in this way will in turn offer its own `_children` property.

This response will include schema fields, areas, etc. in the same detail as it would when requesting a piece.

*The `_children` property always exists. It may be empty.*


### Accessing ancestor pages

Pages also have an `_ancestors` array. This functions similarly to the `_children` array. The first entry is the home page, and the last entry is the immediate parent of the page in question.

### Obtaining the entire page tree with a single request

It is possible to obtain summary information about the entire page tree with a single request. Since the unrestricted use of this feature could have a performance impact, **This feature requires a bearer token or API key**.

> If a bearer token is used, the returned tree will not contain pages to which the user does not have edit access, except for ancestors of pages to which the user *does* have edit access, which is necessary to accurately present the tree.

To fetch the entire tree, add `all=1` to your query:

`/api/v1/apostrophe-pages?all=1`

### Nested tree response

The response will be a single object representing the home page, with at least `title`, `slug`, `tags`, `_url` and `_id` properties, and a `_children` array. For speed, the response will not be as detailed as in a regular request to `/api/v1/apostrophe-pages`.

The pages in the `_children` array, in turn, will feature their own `_children` arrays where needed, with a similarly limited level of detail.

### Flat response

It is possible to obtain a flat version of this data by adding `?flat=1` to the URL. In this case, a flat JSON array is returned. The array is sorted by depth, then by rank. Pages may still have a `_children` array, however it will only contain the `_id`s of the child pages, not the pages themselves. In this way you can still reconstruct the tree if you wish.

## Inserting a page

**All write operations to pages are governed by permissions.** See ["invoking APIs when logged out,"](#invoking-apis-when-logged-out) above. You will need to use an API key or bearer token.

It is possible to insert a page via the API:

`/api/v1/apostrophe-pages`

The body of your POST should contain all of the schema fields you wish to set, **and in addition it must contain a `_parentId` property** (note the underscore). The page will be added as the last child of the specified parent page.

**The use of a JSON body, rather than traditional URL encoding, is strongly recommended and if you are working with areas it is mandatory.**

On success you will receive a 200 status code and a JSON object containing the new page.

**If you wish to insert or update areas, they must be present in the schema of the page type.**

## Updating a page

To update a product, make a PUT request. Send it to:

`/api/v1/apostrophe-pages/cxxxxxxx`

Where `cxxxxxxx` is the `_id` property of the existing page you wish to update.

On success you will receive a 200 status code and the updated JSON object representing the product.

You may use either traditional URL-style encoding or a JSON body. **However if you are working with Apostrophe areas you must use a JSON body** (see below).

**You may not move a page in the page tree via this method. The `path`, `level` and `rank` properties cannot be modified by this method.** To move a page in the page tree, see ["moving a page in the page tree,"](#moving-a-page-in-the-page-tree) below.

**If you wish to insert or update areas, they must be present in the schema of the page type.**

## Deleting a page

To delete a page, make a DELETE request. Send it to:

`/api/v1/apostrophe-pages/cxxxxxxx`

Where `cxxxxxxx` is the `_id` property of the existing page you wish to delete.

The response will be an appropriate HTTP status code.

*For consistency with the rest of Apostrophe, a deleted page is moved to the trash.*

## Moving a page in the page tree

To move a page in the page tree, make a POST request to the following URL:

`/api/v1/apostrophe-pages/ID-OF-PAGE/move`

Your POST body must contain the following fields:

* `targetId` must be the _id of another page.
* `position` must be `before`, `after` or `inside`. The page whose `_id` appears in the URL is moved `before`, `after` or `inside` the page specified by `targetId`. If `inside` is specified, the page becomes the first child of `targetId`.

The home page and other "parked" pages may not be moved.

## Rendering full pages and page fragments

Ordinarily, the API simply returns the content of the page or piece as a JSON data structure. Sometimes, you'd like rendered markup.

### Rendering a full page experience

If you just want the full page representation of a page or piece, rendered as Apostrophe would normally do it, use the API to fetch information about that page or piece, and then separately request the URL in its `._url` property. 

> If you make that request from a browser, it will be detected as an AJAX (“xhr”) request, and the outermost markup of the page (styles, script tags, etc.) will not be returned, just the portion inside the div with the `apos-refreshable` class. You can also get this effect in a non-browser request by setting the `apos_refresh=1` query parameter. Otherwise the page is fully rendered, including assets.

### Rendering a page or piece as an HTML fragment

If you wish to render just a fragment of HTML, read on to see how you can create your own templates specifically for use with the API. This is the best approach when Apostrophe content is just one part of the page or experience you are building.

Let's return to the "products" example and create a Nunjucks template to be rendered by the API:

```markup
{# In lib/modules/products/views/api/fragment.html #}

{# Let's output the title of the piece #}
<h4>{{ data.piece.title }}</h4>
{# Now let's render an area as Apostrophe normally would #}
{{ apo.area(data.piece, 'body') }}
{# On second thought, let's just render the first image in that area directly #}
{% set image = apos.images.first(data.piece, 'body') %}
{% if image %}
  <img src="{{ apos.attachments.url(image, { size: 'one-half' }) }} " />
{% endif %}
```

Now let's configure the `products` module to allow rendering of the `api/fragment.html` template:

```javascript
// in app.js, building on your configuration of products earlier
  'products': {
    extend: 'apostrophe-pieces',
    name: 'product',
    // etc...
    restApi: true,
    apiTemplates: [ 'fragment' ]
  }
```

You will now receive this fragment of HTML as part of the `render` property of a product retrieved from the API, as long as you ask for it as part of your `GET` REST API request:

`/api/v1/products/ID-OF-PRODUCT-GOES-HERE?render=fragment`

Notice we have added `render=fragment` to the query string, to specifically ask that `api/fragment.html` be rendered.

Now the response will look like:

```javascript
{
  _id: "ID-OF-PRODUCT-GOES-HERE",
  title: "Cool Product",
  rendered: {
    fragment: "<h4>Cool Product</h4>... more markup ..."
  }
}
```

> You can render more than one, by passing more than one value for `render`. The resulting URL will look like this: `?render[]=fragment&render[]=other`
>
> If you're using `qs` or another good query string builder, you won't have to worry about building that yourself. Just pass an array of template names as `render`.

