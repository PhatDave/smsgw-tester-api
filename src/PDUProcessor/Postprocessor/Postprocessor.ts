import PduProcessor from "../PduProcessor";

export default abstract class Postprocessor extends PduProcessor {
    readonly type: string = Postprocessor.name;
}
