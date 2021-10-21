
module.exports = (function () {

    const fs = require("fs");
    const { join, resolve } = require("path");
    const { uneval, utils: { customScan, customSource } } = require("uneval.js");

    const index = Symbol.for("cfs.index");
    const global = Symbol.for("cfs.global");
    const parent = Symbol.for("cfs.parent");

    class Config
    {
        [customScan](x) { return x; }

        [customSource]() 
        {
            return this.file != null
            ? `cfs.Config.from(${ JSON.stringify(this.file) })`
            : `new cfs.Config(${ JSON.stringify(this.data.value) })`;
        }

        static from(file, ctx = "", cached = false)
        {
            file = resolve(join(ctx, file));
            if (fs.lstatSync(file).isDirectory())
                file = join(file, "config.js");
            if (!cached)
                delete require.cache[require.resolve(file)];
            return new this(require(file), file);
        }

        constructor(data, file)
        {
            this.data = Data.from({ value: data, config: this });
            this.file = file;
        }

        save(file = this.file, opts = {})
        {
            opts.tab ??= 2;
            opts.safe ??= false;
            opts.export ??= `\nconst cfs = require("config-fs");\nmodule.exports = `;
            opts.namespace ??= new Map([ index, global, parent ].map(x => [ x, x.description ]));
            return uneval.write(file, this.data.value, opts);
        }

        set(req, res) { this.req = req; this.res = res; return this; }

        get(path, folder) { return this.data.get(this.last = path, folder); }

        url(path, folder) { return this.get(Config.url(path), folder); }
    }

    class Data
    {
        static nonFolderObjects = new Set([ Array, Buffer, Config, Data ]);
        
        static from = obj => Object.setPrototypeOf(obj, this.prototype);

        set ref(v)
        {
            this.value = v;
            if ("parent" in this)
                this.parent.value[this.key] = v;
        }

        get(path, folder) { return Config.split(path).reduce((obj, k) => obj.item(k, folder), this); }
    
        item(key, folder = false)
        {
            return (key === global && this.config.data !== this)
            ? this.config.data.item(global) // If the current `Data` is at top level it obtains the key normally
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

        url: x => decodeURIComponent(new URL(x, "http://a").pathname.substr(1)),

        static(path, opts = {})
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

        reference(path, ctx = "")
        {
            const out = Config.static(path, { ctx, isFolder: false });
            out[customSource] = () => `cfs.reference(${ JSON.stringify(path) }, __dirname)`;
            return out;
        },

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