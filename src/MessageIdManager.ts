import {PDU} from "./CommonObjects";

export default class MessageIdManager {
	private static messages: {[key: string]: number} = {};

	static addMessageId(message: PDU, id: number): void {
		this.messages[this.getMessageHash(message)] = id;
	}

	static getMessageId(message: PDU): number | undefined {
		return this.messages[this.getMessageHash(message)];
	}

	private static getMessageHash(message: PDU): string {
		return btoa(`${message.source_addr}:${message.destination_addr}:${message.short_message}`);
	}
}