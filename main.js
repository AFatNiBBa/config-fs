
/*
    [???]: Tutte le robe sull'esempio del "readme.md"
*/

module.exports = (function () {

    const fs = require("fs");
    const { join, resolve } = require("path");
    const { uneval, utils: { customScan, customSource } } = require("uneval.js");

    const index = Symbol.for("cfs.index");
    const global = Symbol.for("cfs.global");
    const parent = Symbol.for("cfs.parent");

    /**
     * Represents a file system configuration object.
     */
    class Config
    {
        /**
         * Gets a "Config" from a config folder.
         * @param {String} dir The path of the config folder
         * @param {String} ctx The current directory (For reliable relative paths)
         * @param {Boolean} cached Indicates if the config file should be reloaded if it has been already loaded in the past
         * @returns The "Config" instance
         */
        static from(dir, ctx = "", cached = false)
        {
            dir = resolve(join(ctx, dir));
            const file = join(dir, "config.js");
            if (!cached)
                delete require.cache[require.resolve(file)];
            return new this(require(file), dir, cached);
        }

        /**
         * Creates an instance of a file system configuration object.
         * @param {any} data The object that will represent the file system
         * @param {String} dir The eventual position of the current object's config folder
         * @param {Boolean} cached Indicates if other configs created by this should be cached
         */
        constructor(data, dir = "", cached = false)
        {
            this.cached = cached;
            this.file = join((this.dir = dir), "config.js");
            this.data = Data.from({ value: data, config: this });
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
            opts.export ??= '\nconst cfs = require("config-fs");\nmodule.exports = ';
            opts.namespace ??= new Map([ index, global ].map(x => [ x, x.description ]));
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
         * @param {String|Array} path The sub object to get from the config (As a "Data" instance)
         * @returns The "Data" instance
         */
        get(path) { return this.data.get(path); }
    }

    /**
     * Represents a node of the file system.
     */
    class Data
    {
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
         * @returns The sub object
         */
        get(path) { return Config.split(path).reduce((obj, k) => obj.item(k), this); }
    
        /**
         * Gets a sub "Data" relatively (Only one level deep).
         * @param {String|Array} key The sub object to get from the config (As a "Data" instance)
         * @returns The sub object
         */
        item(key)
        {
            return key === parent
            ? this.parent
            : Data.from({
                ...this,
                ...(
                    (typeof this.value !== "object" || this.value instanceof Array || this.value instanceof Buffer)
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
            switch (typeof this.value)
            {
                case "bigint":
                case "number":      return this.onRef(null, "list")
                case "function":    return this.value.call(this, "list", this.path);
                case "object":      return Object.keys(this.value);
                default:            return null;
            }
        }
    
        /**
         * Gets the content of the current node (fs.readFileSync).
         * @param {Object} value The value of the node (The current one by the default)
         * @returns A "Buffer" of the content
         */
        read(value = this.value)
        {
            if (value instanceof Buffer)
                return value;
            else if (value instanceof Array)
                return Buffer.concat(value.map(x => {
                    const out = this.read(x);
                    return (out instanceof Buffer)
                    ? out
                    : Buffer.from(out + "")
                }));
            else switch(typeof value)
            {
                case "number":
                case "bigint":      return this.onRef("readFileSync", "read", undefined, value);
                case "string":      return Buffer.from(value);
                case "function":    return value.call(this, "read", this.path);
                case "object":      return this.item(index).read();
            }
        }

        /**
         * Appends to the current node (fs.appendFileSync).
         * @param {Buffer|String|Object} data The data to append
         * @returns Something you should ignore
         */
        append(data)
        {
            switch (typeof this.value)
            {
                case "number":
                case "bigint":      return this.onRef("appendFileSync", "append", data);
                case "function":    return this.value.call(this, "append", this.path, data);
                case "object":
                    if (!(this.value instanceof Array))
                        return this.item(index).append(data);
                default:
                    this.ref = (
                        (this.value instanceof Array)
                        ? this.value.concat(data)
                        : [ this.value, data ]
                    );
            }
        }
    
        /**
         * Writes to the current node (fs.writeFileSync).
         * @param {Buffer|String|Object} data The data to write
         * @returns Something you should ignore
         */
        write(data)
        {
            switch (typeof this.value)
            {
                case "number":
                case "bigint":      return this.onRef("writeFileSync", "write", data);
                case "function":    return this.value.call(this, "write", this.path, data);
                case "object":
                    if (!(this.value instanceof Array))
                        return this.item(index).write(data);
                default:            this.ref = data;
            }
        }

        /**
         * Deletes the current node (fs.unlinkSync).
         * @param {Boolean} ref Should the function delete the eventual real file the node represents
         * @param {Boolean} ignorePath Should the function delete the eventual real file the node represents even if the path points to a inner value to that node (Happens when trying to access an element of something which can't contain elements)
         * @returns Something you should ignore
         */
        delete(ref = true, ignorePath = false)
        {
            ref = ref && (ignorePath || !this.path?.length);
            switch (typeof this.value)
            {
                case "function":
                    return this.value.call(this, "delete", this.path, ref);

                case "number":
                case "bigint":
                    if (ref)
                        this.onRef("unlinkSync", "delete", ref);
                default:
                    delete this.parent.value[this.key];
            }
        }

        /**
         * If "value" points to a file executes an "fs" module function on it, else it tries to load the reference as a config folder and executes an "config-fs" function on the config object.
         * @param {String} f The name of the "fs" function
         * @param {String} fV The name of the "config-fs" function
         * @param {any} data The eventual data to pass to the chosen function
         * @param {Number} value The real file/folder reference (The current node's one by default)
         * @returns Whatever the chosen function returns
         */
        onRef(f, fV, data, value = this.value)
        {
            const path = join(this.config.dir, value + "");
            return (f && fs.lstatSync(path).isFile())
            ? fs[f](path, data)
            : Config.from(path, "", this.config.cached).get(this.path)[fV]?.(data);
        }
    }

    return Object.assign(Config, {
        index, global, parent, Config, Data,

        [customScan]: x => x,
        [customSource]: () => `(${ arguments.callee })()`,

        /**
         * Delegates the request to the current property to a real folder or file.
         * @param {String} path The real folder or file
         * @param {String} ext String to put at the end of the requested path; Prevents the access to everything that doesn't end with that
         * @param {String} ctx The current path (For reliable relative paths)
         * @returns The redirection function
         */
        static(path, ext = "", ctx = "")
        {
            path = join(ctx, path);
            const out = function(mode, args = [], data) {
                const temp = join(path, ...args) + ext;
                switch(mode)
                {
                    case "list": return fs.readdirSync(temp);
                    case "append": return fs.appendFileSync(temp, data);
                    case "write": return fs.writeFileSync(temp, data);
                    case "delete": return data && fs.unlinkSync(temp);

                    default:
                    case "read": return fs.readFileSync(temp);
                }
            };
            out[customScan] = x => x;
            out[customSource] = () => `cfs.static(${ JSON.stringify(path) }, ${ JSON.stringify(ext) })`;
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