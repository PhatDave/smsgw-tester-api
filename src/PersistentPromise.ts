export default class PersistentPromise {
	private readonly promise: Promise<any>;
	private promiseResolve: ((value?: any) => void) | undefined;
	private promiseReject: ((reason?: any) => void) | undefined;

	constructor(callback: (resolve: (value?: any) => void, reject: (reason?: any) => void) => void) {
		this.promise = new Promise((resolve, reject) => {
			callback(resolve, reject);
			this.promiseResolve = resolve;
			this.promiseReject = reject;
		});
	}

	resolve(value?: any): void {
		if (this.promiseResolve) {
			this.promiseResolve(value);
		}
	}

	reject(reason?: any): void {
		if (this.promiseReject) {
			this.promiseReject(reason);
		}
	}

	then(onfulfilled?: ((value: any) => any) | undefined | null, onrejected?: ((reason: any) => any) | undefined | null): Promise<any> {
		return this.promise.then(onfulfilled, onrejected);
	}
}