import SmppSession from "../../../SmppSession";
import Postprocessor from "../Postprocessor";

const smpp = require("smpp");

export default class DeliveryReceiptProcessor extends Postprocessor {
	constructor(type: string) {
		super(type);
	}

	processPdu(session: any, pdu: any, entity?: SmppSession | undefined): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			if (!!pdu.command && pdu.command === "submit_sm" && pdu.registered_delivery) {
				session.send(pdu.response());

				let DRPdu = new smpp.PDU('deliver_sm', {
					source_addr: pdu.destination_addr,
					destination_addr: pdu.source_addr,
					short_message: pdu.short_message
				});
				console.log(pdu);
				session.send(DRPdu);

				resolve(pdu);
			}
		});
	}
}


    // private void sendDeliveryReceipt(Address mtDestinationAddress, Address mtSourceAddress, String messageId, String text) {
    //     SmppSession session = sessionRef.get();
	//
    //     DeliverSm deliver = new DeliverSm();
    //     deliver.setEsmClass(SmppConstants.ESM_CLASS_MT_SMSC_DELIVERY_RECEIPT);
    //     deliver.setSourceAddress(mtSourceAddress);
    //     deliver.setDestAddress(mtDestinationAddress);
    //     deliver.setDataCoding(SmppConstants.DATA_CODING_GSM);
	//
    //     DeliverReportStatus delivered = DeliverReportStatus.DELIVERED;
	//
    //     DeliveryReceipt deliveryReceipt = new DeliveryReceipt();
    //     deliveryReceipt.setDeliveredCount(1);
    //     deliveryReceipt.setDoneDate(DateTime.now());
    //     deliveryReceipt.setRawErrorCode(delivered.getErrorCode());
    //     deliveryReceipt.setMessageId(messageId);
    //     deliveryReceipt.setStateText(delivered.getStateText());
    //     deliveryReceipt.setSubmitCount(1);
    //     deliveryReceipt.setSubmitDate(DateTime.now());
    //     deliveryReceipt.setText(text);
    //     try {
    //         deliver.setShortMessage(deliveryReceipt.toShortMessage().getBytes());
    //     } catch (SmppInvalidArgumentException e) {
    //         //should not be reached
    //         //ignore
    //     }
    //     sendRequestPdu(session, deliver);
    // }