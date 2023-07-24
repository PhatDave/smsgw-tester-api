import {PDU} from "../../../CommonObjects";
import SmppSession from "../../../SmppSession";
import Preprocessor from "../Preprocessor";

export default class SourceSetPreprocessor extends Preprocessor {
    applicableCommands: string[] = ['submit_sm', 'deliver_sm'];
    private sourceSet: string[] = [];

    constructor(type: string) {
        super(type);
        while (this.sourceSet.length < 100) {
            this.sourceSet.push(this.getRandomInt(100000, 999999).toString());
        }
    }

    protected doProcess(session: any, pdu: PDU, entity?: SmppSession | undefined): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            if (pdu.short_message) {
                if (pdu.short_message.includes("arg:")) {
                    let temp: string = pdu.short_message.split(";");
                    let arg: number = Number(temp[0].split(":")[1]);
                    while (this.sourceSet.length < arg) {
                        this.sourceSet.push(this.getRandomInt(100000, 999999).toString());
                    }
                    while (this.sourceSet.length > arg) {
                        this.sourceSet.pop();
                    }
                    pdu.short_message = temp[1];
                }
            }
            pdu.source_addr = pdu.source_addr + this.sourceSet[this.getRandomInt(0, this.sourceSet.length)];
        });
    }

    private getRandomInt(min: number, max: number): number {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min) + min);
    }
}
