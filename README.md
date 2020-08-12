# koop-agol

[![Greenkeeper badge](https://badges.greenkeeper.io/koopjs/koop-provider-agol.svg)](https://greenkeeper.io/)

> ArcGIS Online provider for [Koop](https://github.com/Esri/koop).  Current support for CSV-type items only.  Support for other item types is forth-coming.

[![npm version][npm-img]][npm-url]
[![build status][travis-img]][travis-url]

[npm-img]: https://img.shields.io/npm/v/@koopjs/provider-agol.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/@koopjs/provider-agol
[travis-img]: https://img.shields.io/travis/koopjs/koop-provider-agol.svg?style=flat-square
[travis-url]: https://travis-ci.org/koopjs/koop-provider-agol

## Install

Koop providers require that you first install Koop. For information on using Koop, see https://koopjs.github.io.

You can add `koop-agol` to your Koop server's dependencies by installing it with npm and adding it to your package.json like so:

```
npm install @koopjs/provider-agol --save
```

## Usage
Koop will register a set of output-plugin endpoints for this provider, e.g., `/agol/:host/:id/FeatureServer`. These routes contain two provider-source route parameters to be aware of:

### `host`
This parameter should be a key representing the AGOL host you want as the source of your item data.  The provider ships with four supported keys: `devext` (https://devext.arcgis.com), `qaext` (https://qaext.arcgis.com), `arcgis` (https://arcgis.com), and finally, `_env`, which can only be use if a `host` value is set the provider's configuration object (see below).

### `id`
This parameter should be the AGOL item id.


## Configure
Koop plugins use the node-config module for setting configuration settings.  See the node-config documentation for usage details.  The Koop AGOL provider current has the following configuration settings:
```json
{
  "koopProviderAgol": {
    "host": "https://my-agol-host",
    "maxCsvSize": 1000000
  }
}
```

### `host`
The `host` configuration setting allows you to match a value to requests that arrive with a `_env` route-parameter.  For example, with configuration file shown above and a request like: `http://localhost:1338/agol/_env/abcdef0123456789abcdef0123456789/FeatureServer`, the provider will look for the item on https://my-agol-host)


### maxCsvSize
The maximum number of bytes a CSV item can be in order to be processed by Koop.  Default value is 5000000.


## Resources

* [Koop Documentation](https://koopjs.github.io)
* [ArcGIS for Developers](http://developers.arcgis.com)
* [ArcGIS REST Documentation](http://resources.arcgis.com/en/help/arcgis-rest-api/)
* [@esri](http://twitter.com/esri)

## Issues

Find a bug or want to request a new feature? Please let us know by submitting an issue.

## Contributing

Esri welcomes contributions from anyone and everyone. Please see our [guidelines for contributing](https://github.com/esri/contributing).

## License

[Apache 2.0](LICENSE)

<!-- [](Esri Tags: ArcGIS Web Mapping GeoJson FeatureServices) -->
<!-- [](Esri Language: JavaScript) -->
