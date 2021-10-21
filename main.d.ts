
import { Opts as serialOpts } from "uneval.js";

declare module "config-fs" {
    /**
     * Reference settings.
     */
    export type Opts = {
        /**
         * The current path (For reliable relative paths).
         * @default ""
         */
        ctx?: string,

        /**
         * String to put at the end of the requested path; Prevents the access to everything that doesn't end with that.
         * @default ""
         */
        ext?: string,

        /**
         * The default file when a folder is the target.
         * @default "index"
         */
        index?: string,

        /**
         * Should the sub-paths be used?
         * @default true
         */
        isFolder?: boolean
    };

    /**
     * Possible file operations.
     */
    export type Mode = "list" | "read" | "append" | "write" | "delete";

    /**
     * Represents a file system configuration object.
     */
    declare class Config {
        /** Eventual web request. */
        req?: Request;

        /** Eventual web response. */
        res?: Record;

        /**
         * Gets a `Config` from a config file.
         * @param file The path of the config file
         * @param ctx The current directory (For reliable relative paths)
         * @param cached Indicates if the config file should be reloaded if it has been already loaded in the past
         */
        static from(file: string, ctx?: string, cached?: boolean): Config;

        /**
         * @param data The object that will represent the file system
         * @param file The eventual position of the current object's config file
         */
        constructor(
            public data: any,
            public file?: string
        );

        /**
         * Saves the config to file.
         * @param file The config folder (Defaults to the one passed to the constructor)
         * @param opts Additional serialization options (See "uneval.js" readme.md)
         * @returns Whatever `fs.writeFileSync()` returns
         */
        save(file?: string, opts?: serialOpts): void;

        /**
         * Sets a request and a response in the `Config` object to make them available in the config's functions through `this`.
         * @param req The request
         * @param res  The response
         * @returns The config (For chaining)
         */
        set(req: Request, res: Record): Config;

        /**
         * Equivalent to calling the `Data.get()` method on the top level configuration object.
         * Saves the last requested path in `Config.last`.
         * @param path The sub object to get from the config
         * @param folder If `true` will consider every object as a folder
         * @returns The selected node as a `Data` instance
         */
        get(path: string | (string | symbol)[], folder?: boolean): Data;

        /**
         * Same as calling `Config.get()` but the parameter is parsed as an url.
         * @param {String|URL} path The url
         * @param {Boolean} folder If `true` will consider every object as a folder
         */
        url(path: string | URL, folder?: boolean): Data;
    }

    /**
     * Represents a node of the file system.
     */
    declare class Data {
        /** The types of the objects that are not considered a folder representation. */
        static nonFolderObjects: Set<Function>;

        /**
         * Makes the object in input an instance of `Data`.
         * @param obj The object to transform
         */
        static from(obj: object): Data;

        /**
         * Sets the value in the current `Data` and in the parent object in the config object.
         */
        set ref(v: any);

        /**
         * Gets a sub `Data` relatively.
         * @param path The path to the sub object to get from the config
         * @param folder If `true` will consider every object as a folder
         * @returns The selected node as a `Data` instance
         */
        get(path: string | (string | symbol)[], folder?: boolean): Data;

        /**
         * Gets a sub `Data` relatively (Only one level deep).
         * @param key The sub object to get from the config
         * @param folder If `true` will consider every object as a folder
         * @returns The selected node as a `Data` instance
         */
        item(key: string | symbol, folder?: boolean): Data;

        /**
         * Gets the files in the current node (fs.readdirSync).
         */
        list(): any[] | null;

        /**
         * Gets the content of the current node (fs.readFileSync).
         * @param value The value of the node (The current one by the default)
         * @param k Indicates that the current value being processed is in an array
         * @returns A `Buffer` (or `String`) of the content or `null` if nothing could be read
         */
        read(value?: any, k?: number): string | Buffer | null;

        /**
         * Appends to the current node (fs.appendFileSync).
         * @param data The data to append
         */
        append(data: any): void;

        /**
         * Writes to the current node (fs.writeFileSync).
         * @param data The data to write
         */
        write(data: any): void;

        /**
         * Deletes the current node (fs.unlinkSync).
         * @param ref Should the function delete the eventual real file the node represents
         * @param ignorePath Should the function delete the eventual real file the node represents even if the path points to a inner value to that node (Happens when trying to access an element of something which can't contain elements)
         * @returns A boolean representing if the node was deleted
         */
        delete(ref: boolean, ignorePath: boolean): boolean;
    }

    declare const _: typeof Config & {
        index: symbol,
        global: symbol,
        parent: symbol,
        Config: typeof _,
        Data: typeof Data,

        /**
         * Makes an url a valid "config-fs" path.
         * @param x The url
         */
        url(x: string | URL): string,

        /**
         * Delegates the request to the current property to a real folder or file.
         * @param temp The real folder or file
         * @param opts Settings
         * @returns The redirection function
         */
        static(path: string, opts?: Opts): (mode: Mode, args: (string | symbol)[], data: string | Buffer | boolean) => (string | Buffer | null),

        /**
         * Delegates the request to the current property to a real file relative to the "ctx" path.
         * @param path The real file
         * @param ctx The current path, will be always serialized as "__dirname"
         * @returns The redirection function
         */
        reference(path: string, ctx: string): (mode: Mode, args: (string | symbol)[], data: string | Buffer | boolean) => (string | Buffer | null),

        /**
         * If "path" is falsy returns an empty array, if it's an array it gets returned, else gets divided for every '/' not preceded by an odd number of '\' and replaces every '\\' with '\'.
         * @param path The path to split
         * @returns The array representing the path to the desired "Data" object
         */
        split(path: string | (string | symbol)[]): string[]
    };

    export = _;
}