const zlib = require("zlib");

export default class ZlibCoder {
	static compress(input: string): Buffer {
		return zlib.compress(input);
	}

	static decompress(input: Buffer): string {
		return zlib.decompress(input).toString();
	}
}