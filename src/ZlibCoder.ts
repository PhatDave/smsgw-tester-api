const zlib = require("zlib");

export default class ZlibCoder {
    static compress(input: string): Buffer {
        return zlib.deflateSync(input).toString('base64');
    }

    static decompress(input: Buffer): string {
        return zlib.decompress(input).toString();
    }
}
