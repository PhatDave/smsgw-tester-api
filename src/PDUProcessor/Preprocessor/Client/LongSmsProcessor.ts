import {PDU} from "../../../CommonObjects";
import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

const smpp = require('smpp');

export default class LongSmsProcessor extends Preprocessor {
	private iterator: number = 0;
	static readonly maxMessageSizeBits = 1072;

	constructor(type: string) {
		// An sms can have a maximum length (short_message) of 1120 bits or 140 bytes.
		// For a message encoded in UCS-2, the maximum length is 70 characters. (2 bytes per character)
		// For a message encoded in GSM-7, the maximum length is 160 characters. (7 bits per character)
		// Once a message is split the part information is placed into udh
		// Like
		// destination_addr: config.destinationAddress,
		// short_message: {
		//   udh: Buffer.from([0x05, 0x00, 0x03, 0x05, 0x02, 0x01]),
		//   message: "Hello World!"
		// }
		// The UDH parameters are as follows:
		// 0x05: Length of UDH (5 bytes to follow)
		// 0x00: Concatenated message Information Element (8-bit reference number)
		// 0x03: Length of Information Element data (3 bytes to follow)
		// 0xXX: Reference number for this concatenated message
		// 0xYY: Number of fragments in the concatenated message
		// 0xZZ: Fragment number/index within the concatenated message 1072
		super(type);
	}

	processPdu(session: any, pdu: PDU, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.short_message) {
				let characterSizeBits: number = LongSmsProcessor.getCharacterSizeForEncoding(pdu);
				let maxMessageLength: number = LongSmsProcessor.maxMessageSizeBits / characterSizeBits;
				if (characterSizeBits) {
					let splitMessage: string[] = [];
					let message: string = pdu.short_message;
					let messageLength: number = message.length;
					let messageCount: number = Math.ceil(messageLength / maxMessageLength);
					for (let i = 0; i < messageCount; i++) {
						splitMessage.push(message.substr(i * maxMessageLength, maxMessageLength));
					}

					splitMessage.forEach((messagePart: string, index: number) => {
						let udh: Buffer = Buffer.from([0x05, 0x00, 0x03, this.iterator++, messageCount, index + 1]);

						if (index < (messageCount - 1)) {
							let partPdu = new smpp.PDU(pdu.command, {...pdu});
							partPdu.short_message = {
								udh: udh,
								message: messagePart
							}
							entity?.doSendPdu(partPdu, session);
						} else {
							pdu.short_message = {
								udh: udh,
								message: messagePart
							}
							resolve(pdu);
						}
					});
				}
			}
		});
	}

	static getCharacterSizeForEncoding(pdu: PDU) {
		let encoding: number | undefined = pdu.data_coding;
		if (!encoding) {
			encoding = 0;
		}
		let characterSizeBits: number = 0;
		switch (encoding) {
			case 0:
			case 1:
				characterSizeBits = 8;
				break;
			case 8:
				characterSizeBits = 16;
				break;
		}
		return characterSizeBits;
	}
}