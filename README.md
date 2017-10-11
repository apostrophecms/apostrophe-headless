## Apostrophe as a headless CMS

<img src="https://raw.github.com/punkave/apostrophe-headless/master/jack-o-lantern-head.jpg" align="right" />
[Apostrophe](http://apostrophecms.org) is great for building websites, but many projects these days just need a "headless" CMS: an easy way to create new content types by defining schemas and immediately have a friendly interface for managing them on the back end... and REST APIs on the front end for React, React Native and other frontend frameworks to talk to.

Just as often, projects call for a mix of the two: Apostrophe as a CMS for the pages of the site, with React-style apps "mixed in" on certain pages.

The `apostrophe-headless` module provides REST APIs for content types created with Apostrophe's [pieces](http://apostrophecms.org/docs/tutorials/getting-started/reusable-content-with-pieces.html) feature. With this module, you might choose to just click "Page Settings" and lock down the "home page" of your site to "logged in users only," then use Apostrophe as a pure headless CMS... or you might mix and match. It's up to you.

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

  // Load this module; it improves pieces, so
  // now we can optionally turn on the api
  // for each pieces module
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

> All of the documentation below discusses the `products` example above. Of course you may also configure the `restApi` option for other modules that extend pieces.

## Retrieving all the products

Now your app can access:

`/api/v1/products`

To get the first page of products (50 per page). The response is JSON. See the `results` property for an array of products included in the first page, and the `pages` property for the total number of pages. 

If you want to fetch a second page of products:

`/api/v1/products?page=2`

To avoid performance issues we do not send more than 50 products per API call. Your app should make additional queries as needed.

You can use any [cursor filter](http://apostrophecms.org/docs/tutorials/intermediate/cursors.html) that has a `sanitize` method via the query string. It's [not hard to add custom filters](http://apostrophecms.org/docs/tutorials/intermediate/cursors.html#custom-filters). If you are accessing the API as a user who can edit this piece type, you can use all cursor filters intended for web use, otherwise only the filters marked `safeFor: 'public'`.

## Retrieving one product

You can also retrieve one product via its `_id` property:

`/api/v1/products/cxxxxxxx`

The response is a single JSON object containing the product.

Even though you are fetching just one product, you can still invoke filters via the query string. If you are carrying out this request with the privileges of an admin user, you might want to add `?published=any` to gain access to an unpublished product.

## Inserting, updating and deleting products

These operations follow the usual REST patterns. But first, we need to talk about permissions.

### Invoking APIs when logged out

This is simple: if the user is not logged in, they will be able to `GET` public, published content, and that's all.

For many apps, **that's fine. You're using Apostrophe's admin bar to create the content anyway.**

Your content editors log into a site that's just for content creation, and your app users pull content from it via REST APIs. Great! **You're done here.**

But for those who need to create and manage content via REST too... read on!

### Invoking REST APIs as a logged-in user of your Apostrophe site

If you're building a React app or similar that is part of a webpage delivered by your Apostrophe site, and the right user is already logged into the site, then the APIs will automatically "see" the user and run with the right permissions. However, see the note that follows re: CSRF protection.
 
> If this doesn't sound relevant to your project, skip ahead to learn how to use bearer tokens instead. We've got your back, headless horseman.

### CSRF protection and logged-in users

**If an API request comes from an Apostrophe user who logged in conventionally via the website,** and not via the REST login APIs below, then Apostrophe will check for CSRF (Cross-Site Request Forgery) attacks. 

If your API request is being sent by jQuery as provided by Apostrophe, you're good to go: Apostrophe automatically adds the necessary header.

If your API request is sent via `fetch` or another alternative to jQuery, you'll need to set the `X-XSRF-TOKEN` HTTP header to the current value of `window.apos.csrfCookieName`. This ensures the request didn't come from a sneaky form on a third-party website.

### Logging in and obtaining a bearer token via REST

By default, the `POST`, `DELETE`, `PUT` and `UPDATE` APIs are available to logged-in users of the site. This is quite useful if you want to provide some editing features in a React or similar app that is part of your Apostrophe site.

But for a standalone app that uses Apostrophe as a headless backend, and isn't part of your Apostrophe site in any other way, logging in via Apostrophe's interface might not be an option.

For such cases, you can log in via REST and obtain a "bearer token" to be sent with requests.

> Using bearer tokens only makes sense if you are using Apostrophe as your authentication system. If you are using `apostrophe-passport` to connect Apostrophe to google login, Twitter login, etc., you'll need to log users in via the Apostrophe site and deliver your app via a stripped-down Apostrophe "home page" on that site. See the notes above re: working smoothly with our CSRF protection in this configuration.

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

## Inserting a product

You can insert a product via a POST request. You should POST to:

`/api/v1/products`

The body of your POST should contain all of the schema fields you wish to set. You may use either traditional URL-style encoding or a JSON body.

On success you will receive a 200 status code and a JSON object containing the new product.

## Updating a product

To update a product, make an UPDATE request. Send it to:

`/api/v1/products/cxxxxxxx`

Where `cxxxxxxx` is the `_id` property of the existing product you wish to update.

On success you will receive a 200 status code and the updated JSON object representing the product.

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
* If you won't be serving any pages through Apostrophe (a headless setup), you'll need to fully specify your areas and singletons in the schema of your piece type, including passing all the options you would otherwise pass in a template. Don't use `contextual: true` for headless areas; you'll be doing all of your editing in the "edit" dialog box for the piece.

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

Then you can simply pass the `file` object you received from the attachments API as the `snapshot` property when POSTing a product. Later, when you `GET` this product from the API, you'll note that the attachment has a `._urls` property with versions of various sizes for your use.

Just as often though, you'll want to introduce an image to the shared photo library and reference it via an images widget. Here's how to do that.

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

