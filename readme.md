
# config-fs
Create a virtual file system that works as an object, multiple and circular references included. Great as a router for the 'express' module.

## Usage
You can both import the package like this...
```js
const Config = require("config-fs");
```
...and like this
```js
const { Config } = require("config-fs");
```
You can both create a configuration with an object which will represent the file system or by passing the path of the configuration file (and eventually the current directory to make the path relative).
```js
    const myFs = new Config({ "file.txt": "data" });
    // or
    const myFs = Config.from("config_folder", __dirname, true);
```
If you create a config through a config file you can specify a boolean argument that asks if you want to cache the loaded config (It is `false` by default). You can also save the updates by using `myFs.save()` (It will save only the object, not surrounding code). <br>

## Config Object Values
```js
const { index, global, static, reference, Config } = require("config-fs");
module.exports = {
    public: {                                       // An object represents a folder
        realFolder: static("./real", {              // You can use the "static()" method and passing it a real file or folder to make every request to this property be a real file interaction; You can pass some settings to the function, but they are all optional
          ctx: __dirname,                           // You can pass the current directory to make the path relative
          ext: ".html",                             // You can pass an extension that will be appended to every requested file (preventing the access to files that don't end with that)
          index: "default_file",                    // You can pass a default file name (In this case "default_file.html" because of the "ext" property)
          isFolder: true                            // Indicates if sub-paths should be applied
        }),
        realFile: reference("./a.txt", __dirname),  // You can use the "reference()" method, which is similiar to "static()", but supports only specific files and has the "isFolder" option set to 'false'; You can pass the "ctx" setting as the second argument
        binary: Buffer.from('aGVsbw==', "base64"),  // A buffer represents binary data
        string: "hi",                               // A string is just content
        concat: [                                   // Concatenated data, every other type of data (except folders) can be contained here
            "a",
            "b",
            1                                       // Every non object is converted to string
        ],
        [index]: "index"                            // If you set the "index" symbol as key, it will be used as a sustitute every time a file does not exists in its directory
    },
    dynamic(                                        // A function that will be called when an operation is performed ('this' is the currrent folder as a "Data" instance),
        mode,                                       // 'mode' can be "list" (readdirSync), "read", "append", "write", "delete"
        path,                                       // Trailing elements of path (If you get the path "a/b/c/d" and "b" is a function, then path will be an array containing "c" and "d")
        data,                                       // It's present in "append", "write" and "delete" (In delete mode it tells you if you should delete the eventual real file)
        self                                        // Contains the same thing that is inside 'this'
    ) { },
    inner: Config.from("./sub.js", __dirname),      // You can include sub-configurations to you configuration
    [global]: "Error 404: File not found!"          // If you set the "global" symbol as key, it will be used as a sustitute every time a file does not exists and doesn't have the "index" symbol (It must be at top level)
}
module.exports.public.concat.push(module.exports.public.binary);    // "public/binary" exists both as a standalone file and as a part of "public/concat"
module.exports.public.public = module.exports.public;               // A folder can contain itself
module.exports.concat = module.exports.public.concat;               // A file or folder can be in more places at the same time (these are references, not copies)
```
If you load the configuration from a config file or pass a path after the config object to the constructor you can save the configuration to that path. It will use the "uneval.js" module so that it can save circular references, Buffers, functions, etc... But it will only save object, not the surrounding code <br>
For example the prevous configuration gets saved as this:
```js
const cfs = require("config-fs");
module.exports = (x => ({ 
  public: ( 
    x[2] = { 
      realFolder: cfs.static("./real", { ctx: <absolute path to "." />, ext: ".html", index: "default_file", isFolder: true }), 
      realFile: cfs.reference("./a.txt", __dirname), 
      binary: x[1] = Buffer.from("aGVsbw==", "base64"), 
      string: "hi", 
      concat: x[3] = [ 
        "a", 
        "b", 
        1, 
        x[1] 
      ], 
      [cfs.index]: "index" 
    }, 
    x[2].public = x[2] 
  ), 
  dynamic(
        mode,
        path,
        data,
        self
    ) { }, 
  inner: cfs.Config.from(<absolute path to "./sub.js" />),
  concat: x[3], 
  [cfs.global]: "Error 404: File not found!" 
}))({});
```

## Data Access
```js
const cfs = require("config-fs");
const config = {
    a: {
        [cfs.index]: "default",
        b: "hello",
        c: 1
    },
    "a/b": "hi"
};
const myFs = new cfs(config);

// (You can compare buffers and strings)
myFs.get("a/b").read() == "hello"                           // The "Config.get()" method returns a "Data" object, which represents the selected node
myFs.get("a\\/b").read() == "hi"                            // You can use a back-slash to escape the slash character

myFs.get([ "a", "b" ]).read() == "hello"                    // If you pass an array you don't have to escape the eventual slashes
myFs.get([ "a/b" ]).read() == "hi"

myFs.get([ "a" ]).get("b").read() == "hello"                // The "Data.get()" method works exactly as the "Config.get()"
myFs.get("a/b").get([ cfs.parent ]).read() == "default"     // If you use the array mode of the method you can pass "cfs.parent" to get the parent node
myFs.get("a").get([
  cfs.global,
  cfs.parent,
  ...cfs.split("a/b")                                       // "cfs.split()" converts a path to array mode
]).read() == "hello"                                        // In array mode "cfs.global" and "cfs.parent" together make an absolute path

myFs.get("a/b/c").read() == "hello"                         // The "b" node is not a folder, so "c" will be ignored
myFs.get("a/b/c").path.join() == "c"                        // The "Data.path" field contains the unused path's sections

require("express")().use((req, res) =>
    res.send(
        myFs
        .set(req, res)                                      // You can use the "Config.set()" method to put the request and the response of a routing method in the "Config" object in order to make them available in the config's functions through "this.req" and "this.res"
        .url(req.url)                                       // The "Config.url()" method is the same as "Config.get()" but removes the unwanted parts from the parameter (Which should be an url)
        .read() + ""
    )
);

myFs.get("a").list().join() == "b,c"                        // The function "Data.list()" gets the list of the inner nodes

myFs.get("a").read() == "default"                           // The function "Data.read()" gets the content of the node

myFs.get("a").append("text")                                // The function "Data.append()" does the same thing as the line after this one
config.a[cfs.index] = [ "default", "text" ]

myFs.get("a").write("text")                                 // The function "Data.write()" does the same thing as the line after this one
config.a[cfs.index] = "text"

myFs.get("a").delete()                                      // The function "Data.delete()" does the same thing as the line after this one
delete config.a                                             // (The operation is not performed on the property with "cfs.index" as key because folders can be eliminated)
```
For more informations regarding the functions check the documentation comments in "main.js"