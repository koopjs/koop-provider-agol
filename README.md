# koop-agol
## An ArcGIS online provider to [Koop](https://github.com/Esri/koop) 


## Installation for local development 
1. clone the repo
   ```git clone git@github.com:Esri/koop-agol.git```
2. enter the koop project directory 
    ```cd koop-agol```
3. install the node.js dependencies
    ```npm install```
4. run the tests
    ```npm test``` 

## Installing within a Koop instance 

Koop by default will not intall any providers. Each provider (like this one) must be installed individually. 

Within a Koop instance you can use npm install to install a provider: 
  ```npm install https://github.com/Esri/koop-agol/tarball/master```

This will install the latest code from the github repo into Koop. When the Koop server is started the provider, and its routes/endpoints, will automatically be booted into Koop. 

## Resources
* [Koop](https://github.com/Esri/koop)
* [ArcGIS Developers](http://developers.arcgis.com)
* [ArcGIS REST Services](http://resources.arcgis.com/en/help/arcgis-rest-api/)
* [twitter@esri](http://twitter.com/esri)

## Issues
Find a bug or want to request a new feature?  Please let us know by submitting an issue.

## Contributing
Esri welcomes contributions from anyone and everyone. Please see our [guidelines for contributing](https://github.com/esri/contributing).

## Credit

## Licensing
Copyright 2014 Esri

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A copy of the license is available in the repository's [license.txt]( https://raw.github.com/Esri/koop-agol/master/license.txt) file.

[](Esri Tags: ArcGIS Web Mapping GeoJson FeatureServices)
[](Esri Language: JavaScript)
