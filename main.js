
module.exports = (function () {

    const fs = require("fs");
    const { join, resolve } = require("path");
    const { uneval, utils: { customScan, customSource } } = require("uneval.js");

    const index = Symbol.for("cfs.index");
    const parent = Symbol.for("cfs.parent");

    /**
     * Represents a file system configuration object.
     */
    class Config
    {
        [customScan](x) { return x; }

        [customSource]() 
        {
            return this.file != null
            ? `cfs.Config.from(${ JSON.stringify(this.file) })`
            : `new cfs.Config(${ JSON.stringify(this.data.value) })`;
        }

        /**
         * Gets a "Config" from a config file.
         * @param {String} file The path of the config file
         * @param {String} ctx The current directory (For reliable relative paths)
         * @param {Boolean} cached Indicates if the config file should be reloaded if it has been already loaded in the past
         * @returns The "Config" instance
         */
        static from(file, ctx = "", cached = false)
        {
            file = resolve(join(ctx, file));
            if (fs.lstatSync(file).isDirectory())
                file = join(file, "config.js");
            if (!cached)
                delete require.cache[require.resolve(file)];
            return new this(require(file), file);
        }

        /**
         * Creates an instance of a file system configuration object.
         * @param {any} data The object that will represent the file system
         * @param {String} file The eventual position of the current object's config file
         */
        constructor(data, file)
        {
            this.data = Data.from({ value: data, config: this });
            this.file = file;
        }

        /**
         * Saves the config to file.
         * @param {String} file The config folder (Defaults to the one passed to the constructor)
         * @param {Object} opts Additional serialization options (See "uneval.js" readme.md)
         * @returns Whatever "fs.writeFileSync()" returns
         */
        save(file = this.file, opts = {})
        {
            opts.tab ??= 2;
            opts.safe ??= false;
            opts.export ??= `\nconst cfs = require("config-fs");\nmodule.exports = `;
            opts.namespace ??= new Map([ index, global, parent ].map(x => [ x, x.description ]));
            return uneval.write(file, this.data.value, opts);
        }

        /**
         * Sets a request and a response in the "Config" object to make them available in the config's functions through 'this'.
         * @param {Request} req The request
         * @param {Record} res  The response
         * @returns The config (For chaining)
         */
        set(req, res) { this.req = req; this.res = res; return this; }

        /**
         * Equivalent to calling the "Data.get()" method on the top level configuration object.
         * Saves the last requested path in "Config.last"
         * @param {String|Array} path The sub object to get from the config (As a "Data" instance)
         * @param {Boolean} folder If 'true' will consider every object as a folder
         * @returns The "Data" instance
         */
        get(path, folder) { return this.data.get(this.last = path, folder); }

        /**
         * Same as calling "Config.get()" but the parameter is parsed as an url
         * @param {String|URL} path The url
         * @returns The selected node
         */
        url(path) { return this.get(Config.url(path)); }
    }

    /**
     * Represents a node of the file system.
     */
    class Data
    {
        static nonFolderObjects = new Set([ Array, Buffer, Config, Data ]);
        
        /**
         * Makes the object in input an instance of "Data".
         * @param {Object} obj The object to transform
         * @returns The transformed input object
         */
        static from = obj => Object.setPrototypeOf(obj, this.prototype);

        /**
         * Sets the value in the current "Data" and in the parent object in the config object.
         */
        set ref(v)
        {
            this.value = v;
            if ("parent" in this)
                this.parent.value[this.key] = v;
        }

        /**
         * Gets a sub "Data" relatively.
         * @param {String|Array} path The path to the sub object to get from the config (As a "Data" instance)
         * @param {Boolean} folder If 'true' will consider every object as a folder
         * @returns The sub object
         */
        get(path, folder) { return Config.split(path).reduce((obj, k) => obj.item(k, folder), this); }
    
        /**
         * Gets a sub "Data" relatively (Only one level deep).
         * @param {String|Array} key The sub object to get from the config (As a "Data" instance)
         * @param {Boolean} folder If 'true' will consider every object as a folder
         * @returns The sub object
         */
        item(key, folder = false)
        {
            return (key === global && this.config.data !== this)
            ? this.config.data.item(global) // If the current "Data" is at top level it obtains the key normally
            : (key === parent)
                ? this.parent
                : Data.from({
                    ...this,
                    ...(
                        (typeof this.value !== "object" || (!folder && Data.nonFolderObjects.has(this.value.constructor)))
                        ? { path: (this.path ?? []).concat(key) }
                        : key in this.value
                            ? { value: this.value[key], parent: this }
                            : { value: this.value[index] ?? this.config.data.value[global], parent: this, path: [ key ] }
                    ),
                    key
                });
        }
    
        /**
         * Gets the files in the current node (fs.readdirSync).
         * @returns An "Array" of the inner nodes
         */
        list()
        {
            if (typeof this.value === "function")
                return this.value.call(this, "list", this.path, undefined, this);
            else if (this.value == null || typeof this.value !== "object")
                return null;
            else switch(this.value.constructor)
            {
                case Buffer:
                case Array:     return null;
                case Data:
                case Config:    return this.value.get(this.path).list();
                default:        return Object.keys(this.value);
            }
        }
    
        /**
         * Gets the content of the current node (fs.readFileSync).
         * @param {Object} value The value of the node (The current one by the default)
         * @param {Number} k Indicates that the current value being processed is in an array
         * @returns A "Buffer" of the content or 'null' if nothing could be read
         */
        read(value = this.value, k)
        {
            if (value == null)
                return null;
            else if (typeof value === "function")
                return value.call(this, "read", this.path, undefined, this);
            else if (typeof value !== "object")
                return Buffer.from(value + "");
            else switch(value.constructor)
            {
                case Buffer:    return value;
                case Array:     return Buffer.concat(value.map((x, i) => ((x = this.read(x, i) ?? "") instanceof Buffer) ? x : Buffer.from(x + "")));
                case Data:
                case Config:    return value.get(this.path).read();
                default:
                    console.log(value, k, this.path);
                    return (
                        k // If defined it means that we are processing an object inside of an array
                        ? this.item(k, true).get(this.path)
                        : this.item(index)
                    ).read();
            }
        }

        /**
         * Appends to the current node (fs.appendFileSync).
         * @param {Buffer|String|Object} data The data to append
         * @returns Something you should ignore
         */
        append(data)
        {
            if (typeof this.value === "function")
                return this.value.call(this, "append", this.path, data, this);
            else if (typeof this.value === "object") switch(this.value.constructor)
            {
                case Buffer:    break;
                case Array:     return this.value.push(data);
                case Data:
                case Config:    return this.value.get(this.path).append(data);
                default:        return this.item(index).append(data);
            }
            this.ref = [ this.value, data ];
        }
    
        /**
         * Writes to the current node (fs.writeFileSync).
         * @param {Buffer|String|Object} data The data to write
         * @returns Something you should ignore
         */
        write(data)
        {
            if (typeof this.value === "function")
                return this.value.call(this, "write", this.path, data, this);
            else if (typeof this.value === "object") switch(this.value.constructor)
            {
                case Buffer:
                case Array:     break;
                case Data:
                case Config:    return this.value.get(this.path).write(data);
                default:        return this.item(index).write(data);
            }
            this.ref = data;
        }

        /**
         * Deletes the current node (fs.unlinkSync).
         * @param {Boolean} ref Should the function delete the eventual real file the node represents
         * @param {Boolean} ignorePath Should the function delete the eventual real file the node represents even if the path points to a inner value to that node (Happens when trying to access an element of something which can't contain elements)
         * @returns A boolean representing if the node was deleted
         */
        delete(ref = true, ignorePath = false)
        {
            ref = ref && (ignorePath || !this.path?.length);
            if (typeof this.value !== "function" || (this.value.call(this, "delete", this.path, ref, this) ?? true))
                if ("parent" in this)
                    return delete this.parent.value[this.key];
            return false;
        }
    }

    return Object.assign(Config, {
        index, global, parent, Config, Data,

        [customScan]: x => x,
        [customSource]: () => `(${ arguments.callee })()`,

        /**
         * Makes an url a valid "config-fs" path
         * @param {String|URL} x The url
         * @returns The valid path
         */
        url: x => decodeURIComponent(new URL(x, "http://a").pathname.substr(1)),

        /**
         * Delegates the request to the current property to a real folder or file.
         * @param {String} temp The real folder or file
         * @param {Object} opts Settings
         * @param {String} ctx (In "opts") The current path (For reliable relative paths)
         * @param {String} ext (In "opts") String to put at the end of the requested path; Prevents the access to everything that doesn't end with that
         * @param {String} index (In "opts") The default file when a folder is the target
         * @param {Boolean} isFolder (In "opts") Should the sub-paths be used?
         * @returns The redirection function
         */
        static(path, opts)
        {
            const { ctx = "", ext = "", index = "index", isFolder = true } = opts;

            const temp = join(ctx, path);
            const out = function(mode, args = [], data) {
                try
                {
                    var file = isFolder ? join(temp, ...args) : temp;
                    file = (mode !== "list" && mode !== "delete" && fs.lstatSync(file).isDirectory() ? join(file, index) : file) + ext;
                    switch(mode)
                    {
                        case "list": return fs.readdirSync(file);
                        case "append": return fs.appendFileSync(file, data);
                        case "write": return fs.writeFileSync(file, data);
                        case "delete": return data && fs.unlinkSync(file);

                        default:
                        case "read": return fs.readFileSync(file);
                    }
                }
                catch { return this.item(global).read(); } // Se una funzione da errore restituisce la pagina globale (Da per scontato che la modalità era "read")
            };
            out[customScan] = x => x;
            out[customSource] = () => `cfs.static(${ JSON.stringify(path) }, ${ uneval(opts, { tab: 0, endl: 0, safe: 0 }) })`;
            return out;
        },

        /**
         * Delegates the request to the current property to a real file relative to the "ctx" path.
         * @param {String} path The real file
         * @param {String} ctx The current path, will be always serialized as "__dirname"
         * @returns The redirection function
         */
        reference(path, ctx = "")
        {
            const out = Config.static(path, { ctx, isFolder: false });
            out[customSource] = () => `cfs.reference(${ JSON.stringify(path) }, __dirname)`;
            return out;
        },

        /**
         * If "path" iis falsy returns an empty array, if it's an array gets returned, else gets divided for every '/' not preceded by an odd number of '\' and replaces every '\\' with '\'.
         * @param {String|Array} path The path to split
         * @returns The array representing the path to the desired "Data" object
         */
        split(path)
        {
            if (!path)
                return [];
            else if (path instanceof Array)
                return path;
            else
            {
                const out = [""];
                for (let i = 0; i < path.length; i++)
                    if (path[i] === "/")
                        out.push("");
                    else
                        out[out.length - 1] += path[path[i] === "\\" ? ++i : i];
                return out;
            }
        }
    });
})();