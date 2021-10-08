
# config-fs
Create a virtual file system that works as an object, multiple and circular references included

## Usage
You can both import the package like this...
```js
const Config = require("config-fs");
```
...and like this
```js
const { Config } = require("config-fs");
```
You can both create a configuration with an object which will represent the file system or by passing the path of the configuration folder (and eventually the current directory).
```js
    const myFs = new Config({ "file.txt": "data" });
    // or
    const myFs = Config.from("config_folder", __dirname);
```
If you create a config through a config folder you can save the updates to the config file by using `myFs.save()`. <br>
A config folder has this structure
```sh
config_folder/
├ config.js     # It will export the config object
├ 1             # Normal files that can be referenced by the config object (The name must be a number)
├ 2/            # A sub config folder (The name must be a number)
│ ├ config.js
│ └ 1
┆
├ public/       # This folder will be ignored by the "config.js" because its name is not only composed of numbers
│ └ index.html
└ 34            # You can put as many file as you want, but they must be on the same level as the "config.js" to be considered by it
```

## Config Object Values
```js
const { index, global, static } = require("config-fs");
module.exports = {
    public: {                                                       // An object represents a folder
        real: static("./real", ".html", "default_file", __dirname), // You can use the "static()" method and passing it a real file or folder to make every request to this property be a real file interaction; You can pass an optional extension that will be applied to every requested file (preventing the access to files that don't end with that) and the name of the default file when a folder is specified
        binary: Buffer.from('aGVsbw==', "base64"),                  // A buffer represents binary data
        string: "hi",                                               // A string is just content
        concat: [                                                   // Concatenated data, every other type of data (except folders) can be contained here
            "a",
            "b",
            1                                                       // A reference to a real file or a config folder
        ],
        [index]: "index"                                            // If you set the "index" symbol as key, it will be used as a sustitute every time a file does not exists in its directory
    },
    dynamic(                                                        // A function that will be called when an operation is performed ('this' is the currrent folder as a "Data" instance),
        mode,                                                       // 'mode' can be "list" (readdirSync), "read", "append", "write", "delete"
        path,                                                       // Trailing elements of path (If you get the path "a/b/c/d" and "b" is a function, then path will be an array containing "c" and "d")
        data,                                                       // It's present in "append", "write" and "delete" (In delete mode it tells you if you should delete the eventual real file)
    ) { },
    ref: 1n,                                                        // You can use bigints as references
    [global]: "Error 404: File not found!"                          // If you set the "global" symbol as key, it will be used as a sustitute every time a file does not exists and doesn't have the "index" symbol (It must be at top level)
}
module.exports.public.concat.push(module.exports.public.binary);    // "public/binary" exists both as a standalone file and as a part of "public/concat"
module.exports.public.public = module.exports.public;               // A folder can contain itself
module.exports.concat = module.exports.public.concat;               // A file or folder can be in more places at the same time (these are references, not copies)
```
If you load the configuration from a config folder or pass a path after the config object to the constructor you can save the configuration to the "config.js" file of the selected folder. It will use the "uneval.js" module so that it can save circular references, Buffers, functions, etc... <br>
For example the prevous configuration gets saved as this:
```js
const cfs = require("config-fs");
module.exports = (x => ({ 
	public: ( 
		x[2] = { 
			real: cfs.static(<absolute path to "real">, ".html", "default_file"), 
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
        data
    ) { }, 
	ref: 1n, 
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

myFs.get("a/b/c").read() == "hello"                         // The "b" node is not a folder, so "c" will be ignored
myFs.get("a/b/c").path.join() == "c"                        // The "Data.path" field contains the unused path's sections

require("express")().use((req, res) =>
    res.send(
        myFs
        // You can use the "Config.set()" method to put the request and the response of a routing method in the "Config" object
        // in order to make them available in the config's functions through "this.req" and "this.res"
        .set(req, res)
        .get(req.url)
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