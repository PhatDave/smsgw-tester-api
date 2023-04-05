import PduProcessor from "../PduProcessor";

export default abstract class Preprocessor extends PduProcessor {
	readonly type: string = this.name;
}